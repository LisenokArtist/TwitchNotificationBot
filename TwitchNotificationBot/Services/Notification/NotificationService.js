const TwitchNotificationBot = require('../../TwitchNotificationBot');
const { ServiceBase } = require('../ServiceBase');
const { TwitchService } = require('../Twitch/TwitchService');
const { DiscordService } = require('../Discord/DiscordService');
const { TelegramService } = require('../Telegram/TelegramService');
const { StreamMonitorEventProvider, OnStreamEventArgs } = require('../Twitch/StreamMonitorManager');
const { NotificationConfig } = require('../../Core/AppConfig');
const { KeyValuePair } = require('../../Core/Collections/KeyValuePair');
const { Dictionary } = require('../../Core/Collections/Dictionary/Dictionary');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels');
const { resolve } = require('../../node_modules/discord.js/src/util/ActivityFlagsBitField');
const { PairedQueie } = require('../../Core/Collections/PairedQueie/PairedQueie');

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

        /** @type {PairedQueie} */
        this.queie = new PairedQueie();

        /** @type {Dictionary}*/
        this.toTelegramNotificationQueie = new Dictionary();
        /** @type {Dictionary}*/
        this.toDiscordNotificationQueie = new Dictionary();

        this.timer = null;
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

    /** ��������� ������� � ������������ ������� */
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
     * ������������ ���������
     * @param {TwitchService} twitch
     */
    #registerSettings(twitch) {
        twitch.setChannelsByName(this.twitchChannelNames);
    }

    /**
     * ������������ �������
     * @param {TwitchService} twitch
     * @param {DiscordService} discord
     * @param {TelegramService} telegram
     */
    #registerEvents(twitch, discord, telegram) {
        this.#registerTwitchEvents(twitch);
        // ��� ���������� ����-��� ��������
    }

    /** @param {TwitchService} twitch */
    #registerTwitchEvents(twitch) {
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamStarted, e => this.#onStream(e, StreamMonitorEventProvider.OnStreamStarted));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamUpdated, e => this.#onStream(e, StreamMonitorEventProvider.OnStreamUpdated));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamEnded,   e => this.#onStream(e, StreamMonitorEventProvider.OnStreamEnded));
    }

    /**
     * ����������� ���� ������ ������ �������
     * @param {OnStreamEventArgs[]} eventArgs
     * @param {StreamMonitorEventProvider} event
     */
    #onStream(eventArgs, event) {
        try {
            const streams = eventArgs.map(x => x.stream);
            switch (event) {
                case (StreamMonitorEventProvider.OnStreamStarted):
                    this.#streamIsStarted(streams);
                    break;
                case (StreamMonitorEventProvider.OnStreamUpdated):
                    this.#streamIsUpdated(streams);
                    break;
                case (StreamMonitorEventProvider.OnStreamEnded):
                    this.#streamIsEnded(streams);
                    break;
            }
            console.log(eventArgs.description);
        } catch (e) {
            console.log(`Unexpected error onStream event: ${e}`);
        } finally {
            this.#tryStartTimer();
        }
    }

    /**
     * ��������� ������� ������ � �������
     * @param {StreamResponse[]} streams
     */
    #streamIsStarted(streams) {
        this.#addToQueie(NotificationTypeProvider.Started, NotificationRespondProvider.ToDiscord, streams);
        this.#addToQueie(NotificationTypeProvider.Started, NotificationRespondProvider.ToTelegram, streams);
    }

    /**
     * ��������� ����������� ������ � �������
     * @param {StreamResponse[]} streams
     */
    #streamIsUpdated(streams) {
        this.#addToQueie(NotificationTypeProvider.Updated, NotificationRespondProvider.ToDiscord, streams);
        this.#addToQueie(NotificationTypeProvider.Updated, NotificationRespondProvider.ToTelegram, streams);
    }

    /**
     * ��������� ����������� ������ � �������
     * @param {StreamResponse[]} streams
     */
    #streamIsEnded(streams) {
        this.#addToQueie(NotificationTypeProvider.Ended, NotificationRespondProvider.ToDiscord, streams);
        this.#addToQueie(NotificationTypeProvider.Ended, NotificationRespondProvider.ToTelegram, streams);
    }

    /**
     * ��������� ������ � �������
     * @param {NotificationTypeProvider} type
     * @param {NotificationRespondProvider} target
     * @param {StreamResponse[]} streams
     */
    #addToQueie(type, target, streams) {
        this.queie.pushes(streams.map(x => new NotificationRespond(type, target, x)));
    }

    /**
     * ��������� ������ ����������
     * @returns {Boolean} True ���� ������ ��� ��������
     */
    #tryStartTimer() {
        const isEmpty = !this.queie.collection.length > 0;

        if (isEmpty && !this.timer) {
            this.timer = setTimeout(() => {
                clearTimeout(this.timer);
                this.timer = null;
                this.#onTimerCallback();
            }, this.retryInSeconds * 1000);
            return true;
        }
        return false;
    }

    /**
     * ����������� ����� ������ ��������� ���� ��������
     */
    #onTimerCallback() {
        try {
            do {
                // ��������
            } while (this.queie.collection.length > 0);
        }
        catch (e) {
            console.log(`Notification responds paused with error:${e}`);
            this.#tryStartTimer();
        }
    }
}

const NotificationRespond = class NotificationRespond {
    /**
     * ������� EventArgs ����� ��� ������� ����������� ������� ������
     * @param {NotificationTypeProvider} type ��� �������
     * @param {NotificationRespondProvider} respondTo �������, ������������� �� ���-��
     * @param {StreamResponse} stream ������ � ������
     */
    constructor(type, respondTo, stream) {
        /** @type {NotificationTypeProvider} */
        this.type = type;
        /** @type {NotificationRespondProvider} */
        this.respondTo = respondTo;
        /** @type {StreamResponse} */
        this.stream = stream;
    }
}

const NotificationRespondProvider = {
    ToTelegram: 'toTelegram',
    ToDiscord: 'toDiscord',
}

const NotificationTypeProvider = {
    Started: 'add',
    Updated: 'update',
    Ended: 'remove'
}

const NotificationEventProvider = {
    OnStreamStarted: StreamMonitorEventProvider.OnStreamStarted,
    OnStreamUpdated: StreamMonitorEventProvider.OnStreamUpdated,
    OnStreamEnded: StreamMonitorEventProvider.OnStreamEnded
}

module.exports = { NotificationService, NotificationRespond, NotificationEventProvider }