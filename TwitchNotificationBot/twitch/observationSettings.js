const { TwitchError } = require('./TwitchError');

/**
 * Проверяет интервал опроса.
 * Helix кэширует ответ, поэтому один и тот же запрос не повторяют чаще раза в минуту.
 * @param {unknown} value
 * @returns {number}
 */
function assertPollInterval(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
        throw new TwitchError(`Интервал опроса должен быть не меньше 1 минуты. Получено: ${String(value)}`);
    }

    return value;
}

/**
 * Читает стратегию и интервал. Пустые поля означают опрос раз в минуту.
 * @param {unknown} settings
 * @returns {{ strategy: 'poll'|'websocket', pollIntervalMinutes: number }}
 */
function parseTwitchObservation(settings) {
    const source = settings && typeof settings === 'object'
        ? /** @type {Record<string, unknown>} */ (settings)
        : {};
    const strategy = source.twitchObservation ?? 'poll';
    if (strategy !== 'poll' && strategy !== 'websocket') {
        throw new TwitchError(`Стратегия наблюдения должна быть poll или websocket. Получено: ${String(strategy)}`);
    }

    const pollIntervalMinutes = assertPollInterval(source.twitchPollIntervalMinutes ?? 1);
    return { strategy, pollIntervalMinutes };
}

module.exports = {
    assertPollInterval,
    parseTwitchObservation
};
