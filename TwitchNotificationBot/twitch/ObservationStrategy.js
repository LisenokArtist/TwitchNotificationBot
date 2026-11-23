/** @typedef {import('../ports/StreamObserver').StreamObserver} StreamObserver */

/**
 * Способ узнавать о стримах.
 * Монитор вызывает только start и stop. Сообщения о стриме уходят наблюдателю.
 * Webhook позже станет ещё одной реализацией этого класса.
 */
class ObservationStrategy {
    /**
     * Начинает наблюдение за каналами.
     * @param {string[]} _logins
     * @param {StreamObserver | null} _observer
     * @returns {Promise<void>}
     */
    async start(_logins, _observer) {
    }

    /**
     * Останавливает наблюдение.
     * @returns {Promise<void>}
     */
    async stop() {
    }
}

module.exports = { ObservationStrategy };
