const { TwitchError } = require('./TwitchError');

const MIN_MINUTES = 10;

/**
 * Проверяет интервал в минутах. Короче 10 минут значение не принимается.
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function assertMinutes(value, label) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_MINUTES) {
        throw new TwitchError(`${label} должен быть целым числом минут не меньше ${MIN_MINUTES}. Получено: ${String(value)}`);
    }

    return value;
}

/**
 * Проверяет интервал опроса Helix.
 * @param {unknown} value
 * @returns {number}
 */
function assertPollInterval(value) {
    return assertMinutes(value, 'Интервал опроса');
}

/**
 * Проверяет, как часто обновлять превью, если название и игра не менялись.
 * @param {unknown} value
 * @returns {number}
 */
function assertPreviewRefresh(value) {
    return assertMinutes(value, 'Интервал обновления превью');
}

/**
 * Читает стратегию и интервалы. Пустые поля означают опрос и обновление превью раз в 10 минут.
 * @param {unknown} settings
 * @returns {{ strategy: 'poll'|'websocket', pollIntervalMinutes: number, previewRefreshMinutes: number }}
 */
function parseTwitchObservation(settings) {
    const source = settings && typeof settings === 'object'
        ? /** @type {Record<string, unknown>} */ (settings)
        : {};
    const strategy = source.twitchObservation ?? 'poll';
    if (strategy !== 'poll' && strategy !== 'websocket') {
        throw new TwitchError(`Стратегия наблюдения должна быть poll или websocket. Получено: ${String(strategy)}`);
    }

    const pollIntervalMinutes = assertPollInterval(source.twitchPollIntervalMinutes ?? MIN_MINUTES);
    const previewRefreshMinutes = assertPreviewRefresh(source.twitchPreviewRefreshMinutes ?? MIN_MINUTES);
    return { strategy, pollIntervalMinutes, previewRefreshMinutes };
}

module.exports = {
    assertPollInterval,
    assertPreviewRefresh,
    parseTwitchObservation
};
