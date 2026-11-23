/**
 * Ошибка запроса к Twitch или настроек наблюдения.
 */
class TwitchError extends Error {
    /**
     * @param {string} message
     * @param {number} [status]
     */
    constructor(message, status) {
        super(message);
        this.name = 'TwitchError';
        /** @type {number|undefined} */
        this.status = status;
    }
}

module.exports = { TwitchError };
