const { twitchAuthTokenFile } = require('../config/AppPaths');
/** @typedef {import('../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */
const { TwitchError } = require('./TwitchError');
const { TokenStore } = require('./TokenStore');

const HELIX = 'https://api.twitch.tv/helix/';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const LOGIN_LIMIT = 100;
const EXPIRY_SKEW_MS = 60 * 1000;

/**
 * @typedef {(url: string|URL, options?: { method?: string, headers?: Record<string, string>, body?: string }) => Promise<Response>} FetchLike
 */

/**
 * @typedef {object} TwitchUser
 * @property {string} id
 * @property {string} login
 * @property {string} displayName
 */

/**
 * Статус одного канала: в эфире или нет, и данные эфира, если он идёт.
 */
class StreamStatus {
    /**
     * @param {string} login
     * @param {StreamResponse|null} stream
     */
    constructor(login, stream) {
        /** @type {string} */
        this.login = login;
        /** @type {boolean} */
        this.isLive = stream !== null;
        /** @type {string} */
        this.title = stream?.title ?? '';
        /** @type {string} */
        this.gameName = stream?.game_name ?? '';
        /** @type {string} */
        this.thumbnailUrl = stream?.thumbnail_url ?? '';
        /** @type {StreamResponse|null} */
        this.stream = stream;
    }
}

/**
 * Клиент Helix по ключу приложения: токен, статус стрима и подписки conduit.
 */
class TwitchClient {
    /**
     * @param {object} options
     * @param {string} options.clientId
     * @param {string} options.clientSecret
     * @param {string} [options.tokenFile]
     * @param {FetchLike} [options.fetch]
     */
    constructor(options) {
        /** @type {string} */
        this.#clientId = options.clientId ?? '';
        /** @type {string} */
        this.#clientSecret = options.clientSecret ?? '';
        /** @type {FetchLike} */
        this.#fetch = options.fetch ?? /** @type {FetchLike} */ (fetch);
        /** @type {TokenStore} */
        this.#store = new TokenStore(options.tokenFile ?? twitchAuthTokenFile);
        /** @type {{ accessToken: string, expiresAt: number } | null} */
        this.#cached = null;
    }

    /** @type {string} */
    #clientId;
    /** @type {string} */
    #clientSecret;
    /** @type {FetchLike} */
    #fetch;
    /** @type {TokenStore} */
    #store;
    /** @type {{ accessToken: string, expiresAt: number } | null} */
    #cached;

    /**
     * Возвращает действующий access token. Из файла берётся, пока не истёк.
     * @returns {Promise<string>}
     */
    async getAccessToken() {
        return this.#accessToken(false);
    }

    /**
     * Статус одного канала.
     * @param {string} login
     * @returns {Promise<StreamStatus>}
     */
    async getStreamStatus(login) {
        const statuses = await this.getStreamStatuses([login]);
        const status = statuses[0];
        if (!status) {
            throw new TwitchError('Логин канала пустой');
        }

        return status;
    }

    /**
     * Статусы каналов одним запросом Helix. Офлайн тоже есть в списке.
     * Больше 100 логинов запрос не принимает.
     * @param {string[]} logins
     * @returns {Promise<StreamStatus[]>}
     */
    async getStreamStatuses(logins) {
        const names = normalizeLogins(logins);
        if (names.length === 0) {
            return [];
        }

        const body = await this.#helix('GET', 'streams', names.map(login => ['user_login', login]));
        const live = new Map();
        for (const item of asObjectArray(body.data)) {
            const stream = asStream(item);
            if (!stream) {
                continue;
            }

            live.set(stream.user_login.toLowerCase(), stream);
        }

        return names.map(login => new StreamStatus(login, live.get(login.toLowerCase()) ?? null));
    }

    /**
     * Находит пользователей по логину. Неизвестные логины в ответ не входят.
     * @param {string[]} logins
     * @returns {Promise<TwitchUser[]>}
     */
    async getUsers(logins) {
        const names = normalizeLogins(logins);
        if (names.length === 0) {
            return [];
        }

        const body = await this.#helix('GET', 'users', names.map(login => ['login', login]));
        /** @type {TwitchUser[]} */
        const users = [];
        for (const item of asObjectArray(body.data)) {
            const id = typeof item.id === 'string' ? item.id : '';
            const login = typeof item.login === 'string' ? item.login : '';
            if (id.length === 0 || login.length === 0) {
                continue;
            }

            const displayName = typeof item.display_name === 'string' ? item.display_name : login;
            users.push({ id, login, displayName });
        }

        return users;
    }

    /**
     * Возвращает conduit приложения. Если его нет, создаёт один shard.
     * @returns {Promise<string>}
     */
    async ensureConduit() {
        const existing = await this.#helix('GET', 'eventsub/conduits');
        const found = asObjectArray(existing.data)[0];
        const foundId = found && typeof found.id === 'string' ? found.id : '';
        if (foundId.length > 0) {
            return foundId;
        }

        const created = await this.#helix('POST', 'eventsub/conduits', [], { shard_count: 1 });
        const conduit = asObjectArray(created.data)[0];
        const conduitId = conduit && typeof conduit.id === 'string' ? conduit.id : '';
        if (conduitId.length === 0) {
            throw new TwitchError('Twitch не вернул идентификатор conduit');
        }

        return conduitId;
    }

    /**
     * Привязывает исходящий WebSocket к shard 0.
     * @param {string} conduitId
     * @param {string} sessionId
     * @returns {Promise<void>}
     */
    async bindConduitShard(conduitId, sessionId) {
        const body = await this.#helix('PATCH', 'eventsub/conduits/shards', [], {
            conduit_id: conduitId,
            shards: [{
                id: '0',
                transport: {
                    method: 'websocket',
                    session_id: sessionId
                }
            }]
        });
        const failure = asObjectArray(body.errors)[0];
        const message = failure && typeof failure.message === 'string' ? failure.message : '';
        if (message.length > 0) {
            throw new TwitchError(`Twitch не привязал WebSocket: ${message}`);
        }
    }

    /**
     * Подписывает conduit на событие канала.
     * Повторная подписка (409) считается успехом: она уже есть с прошлого запуска.
     * @param {string} type
     * @param {string} version
     * @param {string} broadcasterUserId
     * @param {string} conduitId
     * @returns {Promise<void>}
     */
    async subscribeConduit(type, version, broadcasterUserId, conduitId) {
        const token = await this.#accessToken(false);
        const response = await this.#send('eventsub/subscriptions', {
            method: 'POST',
            headers: {
                ...this.#authHeaders(token),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                version,
                condition: { broadcaster_user_id: broadcasterUserId },
                transport: { method: 'conduit', conduit_id: conduitId }
            })
        }, true);

        if (response.status === 409) {
            return;
        }

        if (!response.ok) {
            throw new TwitchError(
                `Twitch не создал подписку ${type}: ${response.status} ${await errorText(response)}`,
                response.status
            );
        }
    }

    /**
     * @param {boolean} force
     * @returns {Promise<string>}
     */
    async #accessToken(force) {
        if (!force && this.#cached && this.#cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
            return this.#cached.accessToken;
        }

        if (!force) {
            const stored = this.#store.read();
            if (stored && stored.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
                this.#cached = stored;
                return stored.accessToken;
            }
        }

        return this.#requestToken();
    }

    /**
     * Запрашивает новый токен. У client credentials нет refresh, поэтому старый токен не обновляется.
     * @returns {Promise<string>}
     */
    async #requestToken() {
        if (this.#clientId.length === 0 || this.#clientSecret.length === 0) {
            throw new TwitchError('Не заданы client id и client secret');
        }

        const response = await this.#fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: this.#clientId,
                client_secret: this.#clientSecret,
                grant_type: 'client_credentials'
            })
        });
        const body = await readJson(response);
        const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
        if (!response.ok || accessToken.length === 0) {
            const detail = textField(body, 'message') || textField(body, 'error');
            throw new TwitchError(`Twitch не выдал токен: ${response.status} ${detail}`.trim(), response.status);
        }

        const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 0;
        const tokenType = textField(body, 'token_type') || 'bearer';
        this.#cached = {
            accessToken,
            expiresAt: Date.now() + expiresIn * 1000
        };
        this.#store.write(accessToken, this.#cached.expiresAt, tokenType);
        return accessToken;
    }

    /**
     * @param {'GET'|'POST'|'PATCH'} method
     * @param {string} pathname
     * @param {[string, string][]} [search]
     * @param {Record<string, unknown>} [json]
     * @returns {Promise<Record<string, unknown>>}
     */
    async #helix(method, pathname, search = [], json) {
        const token = await this.#accessToken(false);
        const headers = this.#authHeaders(token);
        /** @type {{ method: string, headers: Record<string, string>, body?: string }} */
        const options = { method, headers };
        if (json) {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(json);
        }

        const response = await this.#send(pathname, options, true, search);
        if (!response.ok) {
            throw new TwitchError(
                `Запрос Helix не выполнен: ${response.status} ${await errorText(response)}`,
                response.status
            );
        }

        return readJson(response);
    }

    /**
     * Повторяет запрос один раз, если Twitch ответил 401. Повтор идёт с новым токеном приложения.
     * @param {string} pathname
     * @param {{ method?: string, headers?: Record<string, string>, body?: string }} options
     * @param {boolean} retryOnUnauthorized
     * @param {[string, string][]} [search]
     * @returns {Promise<Response>}
     */
    async #send(pathname, options, retryOnUnauthorized, search = []) {
        const response = await this.#fetch(helixUrl(pathname, search), options);
        if (response.status !== 401 || !retryOnUnauthorized) {
            return response;
        }

        const token = await this.#accessToken(true);
        const headers = { ...(options.headers ?? {}), Authorization: `Bearer ${token}` };
        return this.#fetch(helixUrl(pathname, search), { ...options, headers });
    }

    /**
     * @param {string} token
     * @returns {Record<string, string>}
     */
    #authHeaders(token) {
        return {
            'Client-Id': this.#clientId,
            Authorization: `Bearer ${token}`
        };
    }
}

/**
 * @param {string} pathname
 * @param {[string, string][]} search
 * @returns {URL}
 */
function helixUrl(pathname, search) {
    const url = new URL(pathname, HELIX);
    for (const [key, value] of search) {
        url.searchParams.append(key, value);
    }

    return url;
}

/**
 * @param {string[]} logins
 * @returns {string[]}
 */
function normalizeLogins(logins) {
    if (!Array.isArray(logins)) {
        throw new TwitchError('Список каналов должен быть массивом логинов');
    }

    if (logins.length > LOGIN_LIMIT) {
        throw new TwitchError('Helix принимает не больше 100 логинов за запрос');
    }

    /** @type {string[]} */
    const result = [];
    const seen = new Set();
    for (const login of logins) {
        if (typeof login !== 'string' || login.trim().length === 0) {
            throw new TwitchError('Логин канала пустой');
        }

        const key = login.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(login);
    }

    return result;
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>[]}
 */
function asObjectArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    /** @type {Record<string, unknown>[]} */
    const result = [];
    for (const item of value) {
        if (item && typeof item === 'object') {
            result.push(/** @type {Record<string, unknown>} */ (item));
        }
    }

    return result;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {StreamResponse|null}
 */
function asStream(item) {
    if (typeof item.user_login !== 'string' || item.user_login.length === 0) {
        return null;
    }

    const stream = /** @type {StreamResponse} */ (/** @type {unknown} */ (item));
    if (typeof stream.thumbnail_url !== 'string') {
        stream.thumbnail_url = '';
    }
    if (typeof stream.title !== 'string') {
        stream.title = '';
    }
    if (typeof stream.game_name !== 'string') {
        stream.game_name = '';
    }
    if (typeof stream.user_name !== 'string') {
        stream.user_name = stream.user_login;
    }

    return stream;
}

/**
 * @param {Response} response
 * @returns {Promise<Record<string, unknown>>}
 */
async function readJson(response) {
    const text = await response.text();
    if (text.length === 0) {
        return {};
    }

    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
            return /** @type {Record<string, unknown>} */ (parsed);
        }
    } catch {
        throw new TwitchError('Twitch вернул неразборчивый ответ', response.status);
    }

    return {};
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} key
 * @returns {string}
 */
function textField(body, key) {
    const value = body[key];
    return typeof value === 'string' ? value : '';
}

/**
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function errorText(response) {
    const body = await readJson(response);
    const detail = textField(body, 'message') || textField(body, 'error');
    return detail.slice(0, 300);
}

module.exports = { TwitchClient, StreamStatus };
