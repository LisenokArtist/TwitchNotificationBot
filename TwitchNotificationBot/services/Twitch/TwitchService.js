const { ServiceBase } = require('../ServiceBase');
const { TwitchClient, createObservationStrategy } = require('../../twitch');
/** @typedef {import('../../config/AppConfig').TwitchConfig} TwitchConfig */
/** @typedef {import('../../ports/StreamObserver').StreamObserver} StreamObserver */
/** @typedef {import('../../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */
/** @typedef {import('../../twitch').ObservationStrategy} ObservationStrategy */
/** @typedef {import('../Notification/StreamNotificationCache').StreamNotificationCache} StreamNotificationCache */

/**
 * Сервис Twitch. Сеть и наблюдение живут в библиотеке twitch.
 * Каналы регистрирует NotificationService уже после Start, поэтому стратегия
 * запускается в тот момент, когда список каналов становится известен.
 */
class TwitchService extends ServiceBase {
    /**
     * @param {TwitchConfig} config
     * @param {StreamNotificationCache | null} [notifications]
     */
    constructor(config, notifications = null) {
        super();

        /** @type {TwitchClient} */
        this.client = new TwitchClient({
            clientId: config.clientId,
            clientSecret: config.secretId
        });
        /** @type {ObservationStrategy} */
        this.strategy = createObservationStrategy(config, this.client, notifications);

        /** @type {string[]} */
        this.#logins = [];
        /** @type {StreamObserver | null} */
        this.#observer = null;
        /** @type {boolean} */
        this.#started = false;
        /** @type {boolean} */
        this.#strategyStarted = false;
    }

    /** @type {string[]} */
    #logins;
    /** @type {StreamObserver | null} */
    #observer;
    /** @type {boolean} */
    #started;
    /** @type {boolean} */
    #strategyStarted;

    /**
     * Задаёт каналы, за которыми следит стратегия.
     * @param {string[]} channels
     */
    setChannelsByName(channels) {
        if (!Array.isArray(channels) || channels.length === 0) {
            throw new Error('Список каналов пуст');
        }
        if (channels.length > 100) {
            throw new Error('Helix принимает не больше 100 каналов за запрос');
        }

        this.#logins = channels.slice();
        if (!this.#started || this.#strategyStarted) {
            return;
        }

        // Список каналов приходит из синхронного вызова, поэтому отказ стратегии пишется в лог.
        void this.#beginStrategy().catch((error) => {
            console.log(`Стратегия Twitch не запустилась: ${error}`);
        });
    }

    /**
     * Подписывает наблюдателя на события стратегии.
     * @param {StreamObserver | null} observer
     */
    setStreamObserver(observer) {
        this.#observer = observer;
    }

    /**
     * Отмечает сервис запущенным и стартует стратегию, если каналы уже заданы.
     * @returns {Promise<void>}
     */
    async Start() {
        this.isInitializated = true;
        this.#started = true;
        if (this.#logins.length === 0 || this.#strategyStarted) {
            return;
        }

        await this.#beginStrategy();
    }

    /**
     * Останавливает стратегию наблюдения.
     * @returns {Promise<void>}
     */
    async Stop() {
        this.#started = false;
        this.#strategyStarted = false;
        await this.strategy.stop();
    }

    /**
     * Возвращает стримы, которые сейчас в эфире.
     * @param {string[]} [userLogins]
     * @returns {Promise<StreamResponse[]>}
     */
    async getStreams(userLogins) {
        const logins = userLogins ?? this.#logins;
        const statuses = await this.client.getStreamStatuses(logins);
        /** @type {StreamResponse[]} */
        const live = [];
        for (const status of statuses) {
            if (status.stream) {
                live.push(status.stream);
            }
        }

        return live;
    }

    /**
     * @returns {Promise<void>}
     */
    async #beginStrategy() {
        this.#strategyStarted = true;
        try {
            await this.strategy.start(this.#logins, this.#observer);
        } catch (error) {
            this.#strategyStarted = false;
            throw error;
        }
    }
}

module.exports = { TwitchService };
