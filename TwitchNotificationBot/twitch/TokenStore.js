const fs = require('node:fs');
const path = require('node:path');
const { TwitchError } = require('./TwitchError');

/**
 * Файл с токеном приложения. Старый файл с полем expiresDate тоже читается.
 */
class TokenStore {
    /**
     * @param {string} file
     */
    constructor(file) {
        /** @type {string} */
        this.file = file;
    }

    /**
     * Возвращает токен, если файл удалось разобрать.
     * @returns {{ accessToken: string, expiresAt: number } | null}
     */
    read() {
        if (!fs.existsSync(this.file)) {
            return null;
        }

        /** @type {unknown} */
        let raw;
        try {
            raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        } catch {
            throw new TwitchError('Не удалось прочитать файл токена Twitch');
        }

        if (!raw || typeof raw !== 'object') {
            return null;
        }

        const record = /** @type {{ accessToken?: unknown, expiresAt?: unknown, expiresDate?: unknown }} */ (raw);
        const accessToken = typeof record.accessToken === 'string' ? record.accessToken : '';
        const expiresAt = Date.parse(String(record.expiresAt ?? record.expiresDate ?? ''));
        if (accessToken.length === 0 || Number.isNaN(expiresAt)) {
            return null;
        }

        return { accessToken, expiresAt };
    }

    /**
     * Записывает токен. refresh_token у ключа приложения нет, поэтому он не сохраняется.
     * @param {string} accessToken
     * @param {number} expiresAt
     * @param {string} tokenType
     */
    write(accessToken, expiresAt, tokenType) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const json = JSON.stringify({
            accessToken,
            tokenType,
            expiresAt: new Date(expiresAt).toISOString()
        });
        fs.writeFileSync(this.file, json);
    }
}

module.exports = { TokenStore };
