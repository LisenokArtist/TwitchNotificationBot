const { TwitchError } = require('./TwitchError');

const MIN_POLL_MINUTES = 1;
const MIN_PREVIEW_MINUTES = 10;
const DEFAULT_STRATEGY = 'websocket';
const DEFAULT_POLL_MINUTES = 2;
const DEFAULT_PREVIEW_MINUTES = 10;

/**
 * Проверяет интервал в минутах.
 * @param {unknown} value
 * @param {string} label
 * @param {number} minimum
 * @returns {number}
 */
function assertMinutes(value, label, minimum) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
        throw new TwitchError(`${label} должен быть целым числом минут не меньше ${minimum}. Получено: ${String(value)}`);
    }

    return value;
}

/**
 * Проверяет интервал опроса Helix. Twitch просит не спрашивать один и тот же запрос чаще раза в минуту.
 * @param {unknown} value
 * @returns {number}
 */
function assertPollInterval(value) {
    return assertMinutes(value, 'Интервал опроса', MIN_POLL_MINUTES);
}

/**
 * Проверяет, как часто обновлять превью, если название и игра не менялись.
 * @param {unknown} value
 * @returns {number}
 */
function assertPreviewRefresh(value) {
    return assertMinutes(value, 'Интервал обновления превью', MIN_PREVIEW_MINUTES);
}

/**
 * Читает стратегию и интервалы. Пустые поля означают websocket, опрос раз в 2 минуты и обновление превью раз в 10.
 * @param {unknown} settings
 * @returns {{ strategy: 'poll'|'websocket', pollIntervalMinutes: number, previewRefreshMinutes: number }}
 */
function parseTwitchObservation(settings) {
    const source = settings && typeof settings === 'object'
        ? /** @type {Record<string, unknown>} */ (settings)
        : {};
    const strategy = source.twitchObservation ?? DEFAULT_STRATEGY;
    if (strategy !== 'poll' && strategy !== 'websocket') {
        throw new TwitchError(`Стратегия наблюдения должна быть poll или websocket. Получено: ${String(strategy)}`);
    }

    const pollIntervalMinutes = assertPollInterval(source.twitchPollIntervalMinutes ?? DEFAULT_POLL_MINUTES);
    const previewRefreshMinutes = assertPreviewRefresh(source.twitchPreviewRefreshMinutes ?? DEFAULT_PREVIEW_MINUTES);
    return { strategy, pollIntervalMinutes, previewRefreshMinutes };
}

module.exports = {
    assertPollInterval,
    assertPreviewRefresh,
    parseTwitchObservation
};
