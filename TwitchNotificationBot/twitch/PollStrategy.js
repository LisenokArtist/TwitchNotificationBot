const { ObservationStrategy } = require('./ObservationStrategy');
const { assertPollInterval } = require('./observationSettings');
/** @typedef {import('../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */
/** @typedef {import('../ports/StreamObserver').StreamObserver} StreamObserver */
/** @typedef {import('./TwitchClient').TwitchClient} TwitchClient */
/** @typedef {import('./TwitchClient').StreamStatus} StreamStatus */

/**
 * @typedef {object} IntervalClock
 * @property {(fn: () => Promise<void>, ms: number) => void} every
 * @property {() => void} stop
 */

const MINUTE_MS = 60 * 1000;

/**
 * Опрос Helix. Интервал не меньше одной минуты.
 * Ошибочный ответ не считается концом стрима и не останавливает следующий опрос.
 */
class PollStrategy extends ObservationStrategy {
    /**
     * @param {TwitchClient} client
     * @param {number} intervalMinutes
     * @param {IntervalClock} [clock]
     */
    constructor(client, intervalMinutes, clock) {
        super();
        assertPollInterval(intervalMinutes);
        /** @type {TwitchClient} */
        this.#client = client;
        /** @type {number} */
        this.#intervalMs = intervalMinutes * MINUTE_MS;
        /** @type {IntervalClock} */
        this.#clock = clock ?? new DefaultClock();
    }

    /** @type {TwitchClient} */
    #client;
    /** @type {number} */
    #intervalMs;
    /** @type {IntervalClock} */
    #clock;
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
                if (!previous) {
                    this.#live.set(key, status.stream);
                    started.push(status.stream);
                } else if (!sameStream(previous, status.stream)) {
                    this.#live.set(key, status.stream);
                    updated.push(status.stream);
                }
            } else if (previous) {
                this.#live.delete(key);
                ended.push(previous);
            }
        }

        for (const [key, stream] of [...this.#live]) {
            if (seen.has(key)) {
                continue;
            }

            this.#live.delete(key);
            ended.push(stream);
        }

        this.#emitStarted(started);
        this.#emitUpdated(updated);
        this.#emitEnded(ended);
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
