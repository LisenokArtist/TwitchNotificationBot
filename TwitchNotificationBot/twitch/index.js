const { TwitchClient, StreamStatus } = require('./TwitchClient');
const { TwitchError } = require('./TwitchError');
const { ObservationStrategy } = require('./ObservationStrategy');
const { PollStrategy } = require('./PollStrategy');
const { WebSocketStrategy } = require('./WebSocketStrategy');
const { parseTwitchObservation, assertPollInterval, assertPreviewRefresh } = require('./observationSettings');

/**
 * Собирает стратегию из настроек. Чужое имя стратегии и чужой интервал сюда не доходят:
 * их отклоняет parseTwitchObservation.
 * @param {{ observation: 'poll'|'websocket', pollIntervalMinutes: number, previewRefreshMinutes: number }} config
 * @param {TwitchClient} client
 * @param {{ observation: () => import('./liveState').LiveRecord[] } | null} [cache]
 * @returns {ObservationStrategy}
 */
function createObservationStrategy(config, client, cache = null) {
    const parsed = parseTwitchObservation({
        twitchObservation: config.observation,
        twitchPollIntervalMinutes: config.pollIntervalMinutes,
        twitchPreviewRefreshMinutes: config.previewRefreshMinutes
    });
    const restored = cache ? () => cache.observation() : undefined;
    if (parsed.strategy === 'websocket') {
        return new WebSocketStrategy(client, {
            previewRefreshMinutes: parsed.previewRefreshMinutes,
            restored
        });
    }

    return new PollStrategy(client, parsed.pollIntervalMinutes, {
        previewRefreshMinutes: parsed.previewRefreshMinutes,
        restored
    });
}

module.exports = {
    TwitchClient,
    StreamStatus,
    TwitchError,
    ObservationStrategy,
    PollStrategy,
    WebSocketStrategy,
    parseTwitchObservation,
    assertPollInterval,
    assertPreviewRefresh,
    createObservationStrategy
};
