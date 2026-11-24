const { ObservationStrategy } = require('./ObservationStrategy');
const { TwitchError } = require('./TwitchError');
const { assertPreviewRefresh } = require('./observationSettings');
const { restoreLiveSet } = require('./liveState');
/** @typedef {import('../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */
/** @typedef {import('../ports/StreamObserver').StreamObserver} StreamObserver */
/** @typedef {import('./TwitchClient').TwitchClient} TwitchClient */
/** @typedef {import('./TwitchClient').TwitchUser} TwitchUser */

const DEFAULT_URL = 'wss://eventsub.wss.twitch.tv/ws';
const WELCOME_TIMEOUT_MS = 10 * 1000;
const MAX_RECONNECTS = 5;
const MINUTE_MS = 60 * 1000;

/**
 * Минимальный сокет: слушаем сообщения и закрываем соединение.
 * На сокет ничего не отправляем. Ответ на протокольный ping даёт сам runtime.
 * @typedef {object} SocketLike
 * @property {(type: string, listener: (event: { data?: unknown }) => void) => void} addEventListener
 * @property {() => void} close
 */

/**
 * @typedef {new (url: string) => SocketLike} SocketConstructor
 */

/**
 * @typedef {object} WebSocketStrategyOptions
 * @property {SocketConstructor} [WebSocket]
 * @property {string} [url]
 * @property {number} [previewRefreshMinutes]
 * @property {() => number} [now]
 * @property {() => import('./liveState').LiveRecord[]} [restored]
 */

/**
 * EventSub через исходящий WebSocket.
 * Подписка с ключом приложения создаётся на conduit, а сокет становится его shard.
 * Прямой транспорт websocket Twitch открывает только пользовательским токеном, его здесь нет.
 * Смена названия или игры и долгая пауза без изменений дают одно и то же обновление.
 */
class WebSocketStrategy extends ObservationStrategy {
    /**
     * @param {TwitchClient} client
     * @param {WebSocketStrategyOptions} [options]
     */
    constructor(client, options) {
        super();
        const previewRefreshMinutes = assertPreviewRefresh(options?.previewRefreshMinutes ?? 10);
        /** @type {TwitchClient} */
        this.#client = client;
        /** @type {SocketConstructor | null} */
        this.#Socket = options?.WebSocket ?? null;
        /** @type {string} */
        this.#url = options?.url ?? DEFAULT_URL;
        /** @type {number} */
        this.#previewRefreshMs = previewRefreshMinutes * MINUTE_MS;
        /** @type {() => number} */
        this.#now = options?.now ?? Date.now;
        /** @type {(() => import('./liveState').LiveRecord[]) | undefined} */
        this.#restored = options?.restored;
    }

    /** @type {TwitchClient} */
    #client;
    /** @type {SocketConstructor | null} */
    #Socket;
    /** @type {string} */
    #url;
    /** @type {number} */
    #previewRefreshMs;
    /** @type {() => number} */
    #now;
    /** @type {(() => import('./liveState').LiveRecord[]) | undefined} */
    #restored;
    /** @type {ReturnType<typeof setInterval> | null} */
    #previewTimer = null;
    /** @type {Map<string, number>} */
    #shownAt = new Map();
    /** @type {boolean} */
    #running = false;
    /** @type {boolean} */
    #connecting = false;
    /** @type {boolean} */
    #reconnectPlanned = false;
    /** @type {boolean} */
    #subscribed = false;
    /** @type {number} */
    #attempts = 0;
    /** @type {number} */
    #keepaliveSeconds = 10;
    /** @type {ReturnType<typeof setTimeout> | null} */
    #keepalive = null;
    /** @type {StreamObserver | null} */
    #observer = null;
    /** @type {SocketLike | null} */
    #socket = null;
    /** @type {string} */
    #conduitId = '';
    /** @type {TwitchUser[]} */
    #users = [];
    /** @type {Map<string, StreamResponse>} */
    #live = new Map();

    /**
     * Подключает сокет, привязывает его к conduit и подписывается на каналы.
     * @param {string[]} logins
     * @param {StreamObserver | null} observer
     * @returns {Promise<void>}
     */
    async start(logins, observer) {
        if (this.#running) {
            this.#observer = observer;
            return;
        }

        this.#observer = observer;
        this.#users = await this.#client.getUsers(logins);
        if (this.#users.length === 0) {
            throw new TwitchError('Twitch не нашёл указанные каналы');
        }

        this.#conduitId = await this.#client.ensureConduit();
        restoreLiveSet(logins, this.#restored, this.#live, this.#shownAt);
        this.#running = true;
        try {
            await this.#open(this.#url, true);
            this.#startPreviewTimer();
        } catch (error) {
            await this.stop();
            throw error;
        }
    }

    /**
     * Закрывает сокет. Подписки conduit при этом остаются у Twitch.
     * @returns {Promise<void>}
     */
    async stop() {
        this.#running = false;
        this.#clearKeepalive();
        this.#clearPreviewTimer();
        const socket = this.#socket;
        this.#socket = null;
        if (socket) {
            socket.close();
        }
    }

    /**
     * @param {string} url
     * @param {boolean} subscribe
     * @returns {Promise<void>}
     */
    async #open(url, subscribe) {
        if (!this.#running || this.#connecting) {
            return;
        }

        this.#connecting = true;
        this.#clearKeepalive();
        const Socket = this.#socketConstructor();
        const socket = new Socket(url);
        const previous = this.#socket;
        this.#socket = socket;
        try {
            await this.#waitWelcome(socket, subscribe);
            this.#attempts = 0;
            if (previous && previous !== socket) {
                previous.close();
            }
        } catch (error) {
            if (this.#socket === socket) {
                this.#socket = previous;
            }
            socket.close();
            throw error;
        } finally {
            this.#connecting = false;
        }
    }

    /**
     * @param {SocketLike} socket
     * @param {boolean} subscribe
     * @returns {Promise<void>}
     */
    #waitWelcome(socket, subscribe) {
        return new Promise((resolve, reject) => {
            let settled = false;
            /** @type {ReturnType<typeof setTimeout> | null} */
            let timer = null;

            /**
             * @param {Error} [error]
             */
            const settle = (error) => {
                if (settled) {
                    return;
                }

                settled = true;
                if (timer !== null) {
                    clearTimeout(timer);
                }
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            };

            timer = setTimeout(() => {
                settle(new TwitchError('Twitch не прислал session_welcome'));
            }, WELCOME_TIMEOUT_MS);

            socket.addEventListener('message', (event) => {
                void this.#onMessage(socket, event.data, subscribe, settle);
            });
            socket.addEventListener('close', () => {
                if (!settled) {
                    settle(new TwitchError('WebSocket закрыт до session_welcome'));
                    return;
                }

                if (this.#socket === socket && this.#running && !this.#connecting) {
                    this.#scheduleReconnect('соединение закрыто');
                }
            });
        });
    }

    /**
     * @param {SocketLike} socket
     * @param {unknown} data
     * @param {boolean} subscribe
     * @param {(error?: Error) => void} settle
     * @returns {Promise<void>}
     */
    async #onMessage(socket, data, subscribe, settle) {
        if (this.#socket !== socket || !this.#running) {
            return;
        }

        const message = await parseMessage(data);
        if (!message) {
            return;
        }

        const type = textField(message.metadata, 'message_type');
        const session = asRecord(message.payload.session);
        const seconds = session.keepalive_timeout_seconds;
        if (typeof seconds === 'number' && seconds > 0) {
            this.#keepaliveSeconds = seconds;
        }
        if (type !== 'session_reconnect') {
            this.#armKeepalive(this.#keepaliveSeconds);
        }

        if (type === 'session_welcome') {
            const sessionId = typeof session.id === 'string' ? session.id : '';
            if (sessionId.length === 0) {
                settle(new TwitchError('Twitch не прислал идентификатор сессии'));
                return;
            }

            try {
                await this.#client.bindConduitShard(this.#conduitId, sessionId);
                if (subscribe && !this.#subscribed) {
                    await this.#subscribeAll();
                    this.#subscribed = true;
                }
                settle();
            } catch (error) {
                settle(error instanceof Error ? error : new TwitchError(String(error)));
            }
            return;
        }

        if (type === 'session_reconnect') {
            const next = typeof session.reconnect_url === 'string' ? session.reconnect_url : '';
            if (next.length > 0) {
                void this.#open(next, false).catch((error) => {
                    const reason = error instanceof Error ? error.message : 'reconnect';
                    this.#scheduleReconnect(reason);
                });
            }
            return;
        }

        if (type === 'notification') {
            await this.#onNotification(message);
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async #subscribeAll() {
        /** @type {[string, string][]} */
        const topics = [
            ['stream.online', '1'],
            ['stream.offline', '1'],
            ['channel.update', '2']
        ];
        for (const user of this.#users) {
            for (const [type, version] of topics) {
                await this.#client.subscribeConduit(type, version, user.id, this.#conduitId);
            }
        }
    }

    /**
     * @param {EventSubMessage} message
     * @returns {Promise<void>}
     */
    async #onNotification(message) {
        const declared = textField(message.metadata, 'subscription_type');
        const nested = textField(asRecord(message.payload.subscription), 'type');
        const type = declared || nested;
        const event = asRecord(message.payload.event);
        if (Object.keys(event).length === 0) {
            return;
        }

        if (type === 'stream.online') {
            await this.#onOnline(event);
            return;
        }
        if (type === 'stream.offline') {
            this.#onOffline(event);
            return;
        }
        if (type === 'channel.update') {
            this.#onUpdated(event);
        }
    }

    /**
     * @param {Record<string, unknown>} event
     * @returns {Promise<void>}
     */
    async #onOnline(event) {
        const login = textField(event, 'broadcaster_user_login');
        if (login.length === 0 || !this.#running) {
            return;
        }

        /** @type {StreamResponse|null} */
        let stream = null;
        try {
            const status = await this.#client.getStreamStatus(login);
            stream = status.stream;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`Статус стрима ${login} не получен: ${message}`);
        }

        if (!this.#running) {
            return;
        }

        const ready = stream ?? blankStream(event);
        const key = login.toLowerCase();
        const previous = this.#live.get(key);
        this.#live.set(key, ready);
        this.#shownAt.set(key, this.#now());
        // Повторный online для уже известного эфира не создаёт второе сообщение.
        if (previous) {
            if (!sameStream(previous, ready)) {
                this.#emitUpdated([ready]);
            }
            return;
        }

        this.#emitStarted([ready]);
    }

    /**
     * @param {Record<string, unknown>} event
     */
    #onOffline(event) {
        const login = textField(event, 'broadcaster_user_login');
        if (login.length === 0 || !this.#running) {
            return;
        }

        const key = login.toLowerCase();
        const stream = this.#live.get(key) ?? blankStream(event);
        this.#live.delete(key);
        this.#shownAt.delete(key);
        this.#emitEnded([stream]);
    }

    /**
     * @param {Record<string, unknown>} event
     */
    #onUpdated(event) {
        const login = textField(event, 'broadcaster_user_login');
        const previous = this.#live.get(login.toLowerCase());
        if (!previous || !this.#running) {
            return;
        }

        const next = /** @type {StreamResponse} */ ({
            ...previous,
            title: textField(event, 'title') || previous.title,
            game_id: textField(event, 'category_id') || previous.game_id,
            game_name: textField(event, 'category_name') || previous.game_name,
            language: textField(event, 'language') || previous.language
        });
        if (sameStream(previous, next)) {
            return;
        }

        this.#live.set(login.toLowerCase(), next);
        this.#shownAt.set(login.toLowerCase(), this.#now());
        this.#emitUpdated([next]);
    }

    #startPreviewTimer() {
        this.#clearPreviewTimer();
        this.#previewTimer = setInterval(() => {
            this.#emitDuePreviews();
        }, this.#previewRefreshMs);
    }

    #clearPreviewTimer() {
        if (this.#previewTimer === null) {
            return;
        }

        clearInterval(this.#previewTimer);
        this.#previewTimer = null;
    }

    /**
     * Заменяет превью у стримов, которые давно не меняли название и игру.
     */
    #emitDuePreviews() {
        if (!this.#running) {
            return;
        }

        /** @type {StreamResponse[]} */
        const due = [];
        const now = this.#now();
        for (const [key, stream] of this.#live) {
            const shownAt = this.#shownAt.get(key);
            if (shownAt !== undefined && now - shownAt < this.#previewRefreshMs) {
                continue;
            }

            this.#shownAt.set(key, now);
            due.push(stream);
        }

        this.#emitUpdated(due);
    }

    /**
     * @param {string} reason
     */
    #scheduleReconnect(reason) {
        if (!this.#running || this.#reconnectPlanned || this.#connecting) {
            return;
        }

        this.#reconnectPlanned = true;
        void this.#reconnect(reason).finally(() => {
            this.#reconnectPlanned = false;
        });
    }

    /**
     * @param {string} reason
     * @returns {Promise<void>}
     */
    async #reconnect(reason) {
        if (!this.#running) {
            return;
        }

        this.#attempts += 1;
        if (this.#attempts > MAX_RECONNECTS) {
            console.log(`WebSocket Twitch остановлен: ${reason}`);
            await this.stop();
            return;
        }

        await delay(1000 * this.#attempts);
        if (!this.#running) {
            return;
        }

        try {
            await this.#open(this.#url, !this.#subscribed);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`WebSocket Twitch: ${message}`);
            await this.#reconnect(reason);
        }
    }

    /**
     * @param {number} seconds
     */
    #armKeepalive(seconds) {
        this.#clearKeepalive();
        this.#keepalive = setTimeout(() => {
            this.#scheduleReconnect('таймаут keepalive');
        }, seconds * 1000);
    }

    #clearKeepalive() {
        if (this.#keepalive === null) {
            return;
        }

        clearTimeout(this.#keepalive);
        this.#keepalive = null;
    }

    /**
     * @returns {SocketConstructor}
     */
    #socketConstructor() {
        if (this.#Socket) {
            return this.#Socket;
        }

        const candidate = /** @type {{ WebSocket?: unknown }} */ (globalThis).WebSocket;
        if (typeof candidate !== 'function') {
            throw new TwitchError('В этой версии Node.js нет WebSocket');
        }

        return /** @type {SocketConstructor} */ (candidate);
    }

    /**
     * @param {StreamResponse[]} streams
     */
    #emitStarted(streams) {
        if (!this.#running || !this.#observer || streams.length === 0) {
            return;
        }

        this.#observer.onStreamStarted(streams);
    }

    /**
     * @param {StreamResponse[]} streams
     */
    #emitUpdated(streams) {
        if (!this.#running || !this.#observer || streams.length === 0) {
            return;
        }

        this.#observer.onStreamUpdated(streams);
    }

    /**
     * @param {StreamResponse[]} streams
     */
    #emitEnded(streams) {
        if (!this.#running || !this.#observer || streams.length === 0) {
            return;
        }

        this.#observer.onStreamEnded(streams);
    }
}

/**
 * @typedef {object} EventSubMessage
 * @property {Record<string, unknown>} metadata
 * @property {Record<string, unknown>} payload
 */

/**
 * @param {unknown} data
 * @returns {Promise<EventSubMessage | null>}
 */
async function parseMessage(data) {
    const text = await readData(data);
    if (text.length === 0) {
        return null;
    }

    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const record = /** @type {Record<string, unknown>} */ (parsed);
        return {
            metadata: asRecord(record.metadata),
            payload: asRecord(record.payload)
        };
    } catch {
        return null;
    }
}

/**
 * @param {unknown} data
 * @returns {Promise<string>}
 */
async function readData(data) {
    if (typeof data === 'string') {
        return data;
    }

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
        return data.toString('utf8');
    }

    if (data && typeof data === 'object' && 'text' in data) {
        const blob = /** @type {{ text?: unknown }} */ (data);
        if (typeof blob.text === 'function') {
            const text = await blob.text();
            return typeof text === 'string' ? text : '';
        }
    }

    return '';
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }

    return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {Record<string, unknown>} source
 * @param {string} key
 * @returns {string}
 */
function textField(source, key) {
    const value = source[key];
    return typeof value === 'string' ? value : '';
}

/**
 * @param {Record<string, unknown>} event
 * @returns {StreamResponse}
 */
function blankStream(event) {
    const login = textField(event, 'broadcaster_user_login');
    return /** @type {StreamResponse} */ (/** @type {unknown} */ ({
        id: textField(event, 'id'),
        user_id: textField(event, 'broadcaster_user_id'),
        user_login: login,
        user_name: textField(event, 'broadcaster_user_name') || login,
        game_id: '',
        game_name: '',
        type: textField(event, 'type') || 'live',
        title: '',
        tags: [],
        viewer_count: 0,
        started_at: textField(event, 'started_at'),
        language: '',
        thumbnail_url: '',
        tag_ids: [],
        is_mature: false
    }));
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

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

module.exports = { WebSocketStrategy };
