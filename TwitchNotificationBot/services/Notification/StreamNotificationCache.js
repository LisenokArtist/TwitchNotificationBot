const fs = require('node:fs');
const path = require('node:path');
/** @typedef {import('../../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */
/** @typedef {import('../../twitch/liveState').LiveRecord} LiveRecord */

/**
 * @typedef {object} StoredStreamNotification
 * @property {string | null} discordMessageId
 * @property {number | null} telegramMessageId
 * @property {boolean} discordClosed
 * @property {boolean} telegramClosed
 * @property {number} shownAt
 * @property {string} announcement
 * @property {StreamResponse | null} stream
 */

/**
 * @typedef {object} StreamNotificationPatch
 * @property {string | null} [discordMessageId]
 * @property {number | null} [telegramMessageId]
 * @property {boolean} [discordClosed]
 * @property {boolean} [telegramClosed]
 * @property {number} [shownAt]
 * @property {string} [announcement]
 * @property {StreamResponse} [stream]
 */

/**
 * Файл с открытыми уведомлениями о стримах.
 * После перезапуска по нему восстанавливаются номера сообщений и список эфиров.
 */
class StreamNotificationCache {
    /**
     * @param {string} file
     */
    constructor(file) {
        /** @type {string} */
        this.file = file;
        /** @type {boolean} */
        this.#loaded = false;
        /** @type {Map<string, StoredStreamNotification>} */
        this.#records = new Map();
    }

    /** @type {boolean} */
    #loaded;
    /** @type {Map<string, StoredStreamNotification>} */
    #records;

    /**
     * Читает файл. Повреждённый файл не мешает запуску: коллекция остаётся пустой.
     */
    load() {
        this.#records = this.#read();
        this.#loaded = true;
    }

    /**
     * @returns {Array<StoredStreamNotification & { login: string }>}
     */
    list() {
        this.#ensureLoaded();
        /** @type {Array<StoredStreamNotification & { login: string }>} */
        const records = [];
        for (const [login, record] of this.#records) {
            records.push({ login, ...record });
        }
        return records;
    }

    /**
     * Эфиры, которые стратегия не должна объявлять заново.
     * @returns {LiveRecord[]}
     */
    observation() {
        this.#ensureLoaded();
        /** @type {LiveRecord[]} */
        const records = [];
        for (const [login, record] of this.#records) {
            if (!record.stream) {
                continue;
            }

            records.push({
                login,
                stream: record.stream,
                shownAt: record.shownAt
            });
        }
        return records;
    }

    /**
     * Дописывает поля одного канала и сохраняет файл.
     * @param {string} login
     * @param {StreamNotificationPatch} patch
     */
    save(login, patch) {
        this.#ensureLoaded();
        const key = login.toLowerCase();
        const current = this.#records.get(key) ?? {
            discordMessageId: null,
            telegramMessageId: null,
            discordClosed: false,
            telegramClosed: false,
            shownAt: Date.now(),
            announcement: '',
            stream: null
        };

        if ('discordMessageId' in patch) {
            current.discordMessageId = typeof patch.discordMessageId === 'string' && patch.discordMessageId.length > 0
                ? patch.discordMessageId
                : null;
        }
        if ('telegramMessageId' in patch) {
            current.telegramMessageId = typeof patch.telegramMessageId === 'number' ? patch.telegramMessageId : null;
        }
        if (typeof patch.discordClosed === 'boolean') {
            current.discordClosed = patch.discordClosed;
        }
        if (typeof patch.telegramClosed === 'boolean') {
            current.telegramClosed = patch.telegramClosed;
        }
        if (typeof patch.shownAt === 'number' && Number.isFinite(patch.shownAt)) {
            current.shownAt = patch.shownAt;
        }
        if (typeof patch.announcement === 'string') {
            current.announcement = patch.announcement;
        }
        if (patch.stream) {
            current.stream = snapshot(patch.stream);
        }

        this.#records.set(key, current);
        this.#write();
    }

    /**
     * Удаляет уведомление канала. Конец стрима больше не нужно продолжать после перезапуска.
     * @param {string} login
     */
    remove(login) {
        this.#ensureLoaded();
        this.#records.delete(login.toLowerCase());
        this.#write();
    }

    #ensureLoaded() {
        if (this.#loaded) {
            return;
        }

        this.load();
    }

    /**
     * @returns {Map<string, StoredStreamNotification>}
     */
    #read() {
        /** @type {Map<string, StoredStreamNotification>} */
        const records = new Map();
        if (!fs.existsSync(this.file)) {
            return records;
        }

        /** @type {unknown} */
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.log(`Файл уведомлений о стримах не прочитан: ${message}`);
            return records;
        }

        if (!raw || typeof raw !== 'object') {
            return records;
        }

        for (const [login, value] of Object.entries(raw)) {
            const record = parseRecord(value);
            if (!record) {
                continue;
            }

            records.set(login.toLowerCase(), record);
        }

        return records;
    }

    #write() {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        /** @type {Record<string, StoredStreamNotification>} */
        const body = {};
        for (const [login, record] of this.#records) {
            body[login] = record;
        }

        const temp = `${this.file}.${process.pid}.tmp`;
        fs.writeFileSync(temp, JSON.stringify(body, null, 2));
        try {
            fs.renameSync(temp, this.file);
        } catch {
            fs.copyFileSync(temp, this.file);
            fs.rmSync(temp, { force: true });
        }
    }
}

/**
 * @param {unknown} value
 * @returns {StoredStreamNotification | null}
 */
function parseRecord(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = /** @type {{ discordMessageId?: unknown, telegramMessageId?: unknown, discordClosed?: unknown, telegramClosed?: unknown, shownAt?: unknown, announcement?: unknown, stream?: unknown }} */ (value);
    const discordMessageId = typeof raw.discordMessageId === 'string' && raw.discordMessageId.length > 0
        ? raw.discordMessageId
        : null;
    const telegramMessageId = typeof raw.telegramMessageId === 'number' && Number.isFinite(raw.telegramMessageId)
        ? raw.telegramMessageId
        : null;
    const discordClosed = raw.discordClosed === true;
    const telegramClosed = raw.telegramClosed === true;
    const shownAt = typeof raw.shownAt === 'number' && Number.isFinite(raw.shownAt) ? raw.shownAt : 0;
    const announcement = typeof raw.announcement === 'string' ? raw.announcement : '';
    const stream = parseStream(raw.stream);
    if (discordMessageId === null && telegramMessageId === null && stream === null && !discordClosed && !telegramClosed) {
        return null;
    }

    return { discordMessageId, telegramMessageId, discordClosed, telegramClosed, shownAt, announcement, stream };
}

/**
 * @param {unknown} value
 * @returns {StreamResponse | null}
 */
function parseStream(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = /** @type {{ user_login?: unknown, user_name?: unknown, title?: unknown, game_name?: unknown, thumbnail_url?: unknown }} */ (value);
    if (typeof raw.user_login !== 'string' || raw.user_login.length === 0) {
        return null;
    }

    return snapshot(/** @type {StreamResponse} */ ({
        user_login: raw.user_login,
        user_name: typeof raw.user_name === 'string' ? raw.user_name : raw.user_login,
        title: typeof raw.title === 'string' ? raw.title : '',
        game_name: typeof raw.game_name === 'string' ? raw.game_name : '',
        thumbnail_url: typeof raw.thumbnail_url === 'string' ? raw.thumbnail_url : ''
    }));
}

/**
 * @param {StreamResponse} stream
 * @returns {StreamResponse}
 */
function snapshot(stream) {
    return /** @type {StreamResponse} */ ({
        user_login: String(stream.user_login ?? ''),
        user_name: String(stream.user_name ?? ''),
        title: String(stream.title ?? ''),
        game_name: String(stream.game_name ?? ''),
        thumbnail_url: String(stream.thumbnail_url ?? '')
    });
}

module.exports = { StreamNotificationCache };
