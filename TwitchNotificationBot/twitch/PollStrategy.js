const { ObservationStrategy } = require('./ObservationStrategy');
const { assertPollInterval, assertPreviewRefresh } = require('./observationSettings');
const { restoreLiveSet } = require('./liveState');
/** @typedef {import('../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */
/** @typedef {import('../ports/StreamObserver').StreamObserver} StreamObserver */
/** @typedef {import('./TwitchClient').TwitchClient} TwitchClient */
/** @typedef {import('./TwitchClient').StreamStatus} StreamStatus */

/**
 * @typedef {object} IntervalClock
 * @property {(fn: () => Promise<void>, ms: number) => void} every
 * @property {() => void} stop
 */

/**
 * @typedef {object} PollStrategyOptions
 * @property {IntervalClock} [clock]
 * @property {number} [previewRefreshMinutes]
 * @property {() => number} [now]
 * @property {() => import('./liveState').LiveRecord[]} [restored]
 */

const MINUTE_MS = 60 * 1000;

/**
 * Опрос Helix. Интервал не меньше 10 минут.
 * Если название или игра изменились, наблюдатель получает обновление сразу.
 * Если они не менялись дольше заданного промежутка, обновление всё равно уходит,
 * чтобы получатель мог заменить прикреплённое превью.
 * Ошибочный ответ не считается концом стрима и не останавливает следующий опрос.
 * Уже известные эфиры читаются до первого запроса, чтобы перезапуск не слал повторный старт.
 */
class PollStrategy extends ObservationStrategy {
    /**
     * @param {TwitchClient} client
     * @param {number} intervalMinutes
     * @param {PollStrategyOptions} [options]
     */
    constructor(client, intervalMinutes, options) {
        super();
        assertPollInterval(intervalMinutes);
        const previewRefreshMinutes = assertPreviewRefresh(options?.previewRefreshMinutes ?? 10);
        /** @type {TwitchClient} */
        this.#client = client;
        /** @type {number} */
        this.#intervalMs = intervalMinutes * MINUTE_MS;
        /** @type {number} */
        this.#previewRefreshMs = previewRefreshMinutes * MINUTE_MS;
        /** @type {IntervalClock} */
        this.#clock = options?.clock ?? new DefaultClock();
        /** @type {() => number} */
        this.#now = options?.now ?? Date.now;
        /** @type {(() => import('./liveState').LiveRecord[]) | undefined} */
        this.#restored = options?.restored;
    }

    /** @type {TwitchClient} */
    #client;
    /** @type {number} */
    #intervalMs;
    /** @type {IntervalClock} */
    #clock;
    /** @type {number} */
    #previewRefreshMs;
    /** @type {() => number} */
    #now;
    /** @type {(() => import('./liveState').LiveRecord[]) | undefined} */
    #restored;
    /** @type {Map<string, number>} */
    #shownAt = new Map();
    /** @type {string[]} */
    #logins = [];
    /** @type {StreamObserver | null} */
    #observer = null;
    /** @type {Map<string, StreamResponse>} */
    #live = new Map();
    /** @type {boolean} */
    #running = false;
    /** @type {boolean} */
    #busy = false;

    /**
     * Сразу спрашивает Helix, затем повторяет запрос с заданным интервалом.
     * @param {string[]} logins
     * @param {StreamObserver | null} observer
     * @returns {Promise<void>}
     */
    async start(logins, observer) {
        this.#logins = logins.slice();
        this.#observer = observer;
        if (this.#running) {
            return;
        }

        restoreLiveSet(this.#logins, this.#restored, this.#live, this.#shownAt);
        this.#running = true;
        await this.#tick();
        if (!this.#running) {
            return;
        }

        this.#clock.every(() => this.#tick(), this.#intervalMs);
    }

    /**
     * Останавливает таймер. Уже полученный список эфиров остаётся до следующего start.
     * @returns {Promise<void>}
     */
    async stop() {
        this.#running = false;
        this.#clock.stop();
    }

    /**
     * @returns {Promise<void>}
     */
    async #tick() {
        if (!this.#running || this.#busy) {
            return;
        }

        this.#busy = true;
        try {
            const statuses = await this.#client.getStreamStatuses(this.#logins);
            if (this.#running) {
                this.#apply(statuses);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`Опрос стримов не выполнен: ${message}`);
        } finally {
            this.#busy = false;
        }
    }

    /**
     * @param {StreamStatus[]} statuses
     */
    #apply(statuses) {
        /** @type {StreamResponse[]} */
        const started = [];
        /** @type {StreamResponse[]} */
        const updated = [];
        /** @type {StreamResponse[]} */
        const ended = [];
        const seen = new Set();

        for (const status of statuses) {
            const key = status.login.toLowerCase();
            seen.add(key);
            const previous = this.#live.get(key);
            if (status.isLive && status.stream) {
                const changed = previous ? !sameStream(previous, status.stream) : false;
                if (!previous) {
                    this.#remember(key, status.stream);
                    started.push(status.stream);
                } else if (changed || this.#previewIsDue(key)) {
                    this.#remember(key, status.stream);
                    updated.push(status.stream);
                }
            } else if (previous) {
                this.#forget(key);
                ended.push(previous);
            }
        }

        for (const [key, stream] of [...this.#live]) {
            if (seen.has(key)) {
                continue;
            }

            this.#forget(key);
            ended.push(stream);
        }

        this.#emitStarted(started);
        this.#emitUpdated(updated);
        this.#emitEnded(ended);
    }

    /**
     * @param {string} key
     * @param {StreamResponse} stream
     */
    #remember(key, stream) {
        this.#live.set(key, stream);
        this.#shownAt.set(key, this.#now());
    }

    /**
     * @param {string} key
     */
    #forget(key) {
        this.#live.delete(key);
        this.#shownAt.delete(key);
    }

    /**
     * Превью пора заменить, даже если название и игра те же.
     * Смена названия или игры сбрасывает этот отсчёт.
     * @param {string} key
     * @returns {boolean}
     */
    #previewIsDue(key) {
        const shownAt = this.#shownAt.get(key);
        if (shownAt === undefined) {
            return true;
        }

        return this.#now() - shownAt >= this.#previewRefreshMs;
    }

    /**
     * @param {StreamResponse[]} streams
     */
    #emitStarted(streams) {
        if (streams.length === 0 || !this.#observer) {
            return;
        }

        this.#observer.onStreamStarted(streams);
    }

    /**
     * @param {StreamResponse[]} streams
     */
    #emitUpdated(streams) {
        if (streams.length === 0 || !this.#observer) {
            return;
        }

        this.#observer.onStreamUpdated(streams);
    }

    /**
     * @param {StreamResponse[]} streams
     */
    #emitEnded(streams) {
        if (streams.length === 0 || !this.#observer) {
            return;
        }

        this.#observer.onStreamEnded(streams);
    }
}

class DefaultClock {
    /** @type {ReturnType<typeof setInterval> | null} */
    #handle = null;

    /**
     * @param {() => Promise<void>} fn
     * @param {number} ms
     */
    every(fn, ms) {
        this.#handle = setInterval(() => {
            void fn();
        }, ms);
    }

    stop() {
        if (this.#handle === null) {
            return;
        }

        clearInterval(this.#handle);
        this.#handle = null;
    }
}

/**
 * @param {StreamResponse} previous
 * @param {StreamResponse} next
 * @returns {boolean}
 */
function sameStream(previous, next) {
    return previous.title === next.title
        && previous.game_name === next.game_name
        && previous.thumbnail_url === next.thumbnail_url;
}

module.exports = { PollStrategy };
