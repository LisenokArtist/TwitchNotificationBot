/** @typedef {import('./Twitch/TwitchApiModels').StreamResponse} StreamResponse */

/**
 * Наблюдатель за стартом, обновлением и завершением стримов.
 * Пустые методы позволяют реализовать только нужные события.
 */
class StreamObserver {
    /**
     * Стрим начался.
     * @param {StreamResponse[]} streams
     */
    onStreamStarted(streams) {
    }

    /**
     * Данные стрима обновились.
     * @param {StreamResponse[]} streams
     */
    onStreamUpdated(streams) {
    }

    /**
     * Стрим завершился.
     * @param {StreamResponse[]} streams
     */
    onStreamEnded(streams) {
    }
}

module.exports = { StreamObserver };
