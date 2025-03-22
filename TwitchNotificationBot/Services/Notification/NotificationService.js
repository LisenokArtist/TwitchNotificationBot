const TwitchNotificationBot = require('../../TwitchNotificationBot');
const { ServiceBase } = require('../ServiceBase');
const { TwitchService } = require('../Twitch/TwitchService');
const { DiscordService } = require('../Discord/DiscordService');
const { TelegramService } = require('../Telegram/TelegramService');
const { StreamMonitorEventProvider, OnStreamEventArgs } = require('../Twitch/StreamMonitorManager');
const { NotificationConfig } = require('../../Core/AppConfig')

class NotificationService extends ServiceBase {

    /** @param {NotificationConfig} config */
    constructor(config) {
        super();

        /** @type {String[]} */
        this.twitchChannelNames = config.twitchMonitorChannelNames;
        /** @type {Number} */
        this.discordChannelId = config.discordRespondChannelId;
        /** @type {Number} */
        this.telegramChannelId = config.telegramRespondChannelId;

        /** @type {Number} */
        this.retryCounts = 3;
        /** @type {Number} */
        this.retryInSeconds = 60;
        this.notificationQueie = [];
        /** @type {Boolean} */
        this.isEventsRegistered = false;
    }

    async Start() {
        if (!this.isEventsRegistered) {
            await this.#retriveServicesAndRegisterEvents();
        }
    }

    async Stop() {
        console.log('NotificationService is not require to stop');
    }

    /** Извлекает сервисы и регистрирует события */
    async #retriveServicesAndRegisterEvents() {
        /** @type {TwitchNotificationBot}*/
        const base = this.parent;
        if (!base) throw new Error('Parent property is not set');

        const twitchIndex = base.services.findIndex(x => x.constructor.name == 'TwitchService');
        if (!base.services[twitchIndex]) throw new Error('Twitch service not defined');

        const discordIndex = base.services.findIndex(x => x.constructor.name == 'DiscordService')
        if (!base.services[discordIndex]) throw new Error('Discord service not defined');

        const telegramIndex = base.services.findIndex(x => x.constructor.name == 'TelegramService');
        if (!base.services[telegramIndex]) throw new Error('Telegram service not defined');

        this.#registerSettings(
            base.services[twitchIndex]);

        this.#registerEvents(
            base.services[twitchIndex],
            base.services[discordIndex],
            base.services[telegramIndex]);

        this.isEventsRegistered = true;
    }

    /**
     * Регистрирует настройки
     * @param {TwitchService} twitch
     */
    #registerSettings(twitch) {
        twitch.setChannelsByName(this.twitchChannelNames);
    }

    /**
     * Регистрирует события
     * @param {TwitchService} twitch
     * @param {DiscordService} discord
     * @param {TelegramService} telegram
     */
    #registerEvents(twitch, discord, telegram) {
        this.#registerTwitchEvents(twitch);
    }

    /** @param {TwitchService} twitch */
    #registerTwitchEvents(twitch) {
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamStarted, e => this.#onStream(e));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamUpdated, e => this.#onStream(e));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamEnded, e => this.#onStream(e));
    }

    /** @param {OnStreamEventArgs} streamEventArgs */
    #onStream(streamEventArgs) {
        console.log(streamEventArgs.description);
    }
}

module.exports = { NotificationService }