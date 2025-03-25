const TwitchNotificationBot = require('../../TwitchNotificationBot');
const { ServiceBase } = require('../ServiceBase');
const { TwitchService } = require('../Twitch/TwitchService');
const { DiscordService } = require('../Discord/DiscordService');
const { TelegramService } = require('../Telegram/TelegramService');
const { StreamMonitorEventProvider, OnStreamEventArgs } = require('../Twitch/StreamMonitorManager');
const { NotificationConfig } = require('../../Core/AppConfig');
const { Dictionary, KeyValuePair } = require('../../Core/Dictionary');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels');
const { resolve } = require('../../node_modules/discord.js/src/util/ActivityFlagsBitField');

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
        this.retryInSeconds = 60;

        /** @type {Dictionary}*/
        this.notificationQueie = new Dictionary();

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
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamStarted, e => this.#onStream(e, StreamMonitorEventProvider.OnStreamStarted));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamUpdated, e => this.#onStream(e, StreamMonitorEventProvider.OnStreamUpdated));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamEnded,   e => this.#onStream(e, StreamMonitorEventProvider.OnStreamEnded));
    }

    /**
     * 
     * @param {OnStreamEventArgs} eventArgs
     * @param {StreamMonitorEventProvider} event
     */
    #onStream(eventArgs, event) {
        try {
            switch (event) {
                case (StreamMonitorEventProvider.OnStreamStarted):
                    this.notificationQueie.push(
                        new KeyValuePair(eventArgs.stream.id, eventArgs.stream));
                    this.emit(
                        NotificationEventProvider.OnStreamStarted,
                        new OnNotificationEventArgs(
                            this.notificationQueie.collection[this.notificationQueie.collection.length - 1]));
                    break;
                case (StreamMonitorEventProvider.OnStreamUpdated):
                    break;
                case (StreamMonitorEventProvider.OnStreamEnded):
                    /** @type {StreamResponse}*/
                    const stream = this.notificationQueie.popBy(x => x.key === eventArgs.stream.id).value;
                    this.emit(
                        NotificationEventProvider.OnStreamEnded,
                        new OnNotificationEventArgs(stream));
                    break;
            }
            console.log(eventArgs.description);
        } catch (e) {
            console.log(`Unexpected error onStream event: ${e}`);
        }
    }

    /** @param {OnNotificationEventArgs} eventArgs */
    #onStreamStarted(eventArgs) {

        //const promise = new Promise(async (resolve, reject) => {
        //    const respondFunc = async () => {
        //        const isPassed = await tryRespondToDiscord();
        //        if (isPassed) { return true; }
        //        return false;
        //    }

        //    let retry = this.retryCounts;
        //    const pause = 60 * 1000;

        //    setTimeout(async function func() {
        //        retry--;

        //        if (retry > 0) {
        //            if (await respondFunc(resolve)) {
        //                resolve(true);
        //            } else {
        //                setTimeout(func(), pause)
        //            }
        //        }
        //    }, pause)
        //    reject('Respond to chat timeout');
        //});
        //promise.catch(x => console.log(x));
    }

    /** @param {OnNotificationEventArgs} eventArgs */
    #onStreamUpdated(eventArgs) {

    }

    /** @param {OnNotificationEventArgs} eventArgs */
    #onStreamEnded(eventArgs) {

    }

    async tryRespondToDiscord(client) {

    }

    async tryRespondToTelegram(client) {

    }
}

const OnNotificationEventArgs = class OnNotificationEventArgs {
    /**
     * Создает EventArgs класс для событий уведомлений статуса стрима
     * @param {StreamResponse} stream Данные о стриме
     */
    constructor(stream) {
        /** @type {StreamResponse} */
        this.stream = stream;
    }
}

const NotificationEventProvider = {
    OnStreamStarted: StreamMonitorEventProvider.OnStreamStarted,
    OnStreamUpdated: StreamMonitorEventProvider.OnStreamUpdated,
    OnStreamEnded: StreamMonitorEventProvider.OnStreamEnded
}

module.exports = { NotificationService, OnNotificationEventArgs, NotificationEventProvider }