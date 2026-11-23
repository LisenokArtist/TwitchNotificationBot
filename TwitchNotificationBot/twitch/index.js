const { TwitchClient, StreamStatus } = require('./TwitchClient');
const { TwitchError } = require('./TwitchError');
const { ObservationStrategy } = require('./ObservationStrategy');
const { PollStrategy } = require('./PollStrategy');
const { WebSocketStrategy } = require('./WebSocketStrategy');
const { parseTwitchObservation, assertPollInterval } = require('./observationSettings');

/**
 * Собирает стратегию из настроек. Чужое имя стратегии и чужой интервал сюда не доходят:
 * их отклоняет parseTwitchObservation.
 * @param {{ observation: 'poll'|'websocket', pollIntervalMinutes: number }} config
 * @param {TwitchClient} client
 * @returns {ObservationStrategy}
 */
function createObservationStrategy(config, client) {
    const parsed = parseTwitchObservation({
        twitchObservation: config.observation,
        twitchPollIntervalMinutes: config.pollIntervalMinutes
    });
    if (parsed.strategy === 'websocket') {
        return new WebSocketStrategy(client);
    }

    return new PollStrategy(client, parsed.pollIntervalMinutes);
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
    createObservationStrategy
};
