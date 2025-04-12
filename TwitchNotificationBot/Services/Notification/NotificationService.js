const { TwitchNotificationBot } = require('../../TwitchNotificationBot');
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
const EmbedBuilder = require('../../node_modules/discord.js/src/structures/EmbedBuilder');
const User = require('../../node_modules/discord.js/src/structures/User');

class NotificationService extends ServiceBase {

    /** @param {NotificationConfig} config */
    constructor(config) {
        super();

        /** @type {String[]} */
        this.twitchChannelNames = config.twitchMonitorChannelNames;

        /** @type {Number} */
        this.discordGuildId = config.discordGuildId;
        /** @type {Number} */
        this.discordChannelId = config.discordRespondChannelId;

        /** @type {Number} */
        this.telegramChannelId = config.telegramRespondChannelId;
        /** @type {number|null} */
        this.telegramRespondThreadId = config.telegramRespondThreadId;

        /** @type {string[]} */
        this.messagesStartAnnouncement = config.messagesStartAnnouncement;
        /** @type {string[]} */
        this.messagesEndAnnouncement = config.messagesEndAnnouncement;



        /** @type {Number} */
        this.retryInSeconds = 60;

        /** @type {PairedQueie} */
        this.queie = new PairedQueie();

        /** @type {Dictionary}*/
        this.toTelegramNotificationQueie = new Dictionary();
        /** @type {Dictionary}*/
        this.toDiscordNotificationQueie = new Dictionary();

        /** @type {NodeJS.Timeout|null}*/
        this.timer = null;
        /** @type {Boolean} */
        this.isEventsRegistered = false;
    }

    async Start() {
        // Пропускаем инициализацию
        this.isInitializated = true;

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
        // Для остального пока-что заглушки
    }

    /** @param {TwitchService} twitch */
    #registerTwitchEvents(twitch) {
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamStarted, e => this.#onStream(e, StreamMonitorEventProvider.OnStreamStarted));
        //Событие по обновлению стримов оставим на потом. Нужно будет добавить возможность обновлять отправляемую запись в чат.
        //twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamUpdated, e => this.#onStream(e, StreamMonitorEventProvider.OnStreamUpdated));
        twitch.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamEnded,   e => this.#onStream(e, StreamMonitorEventProvider.OnStreamEnded));
    }

    /**
     * Срабатывает если статус стрима изменен
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
     * Добавляет начатые стримы в очередь
     * @param {StreamResponse[]} streams
     */
    #streamIsStarted(streams) {
        this.#addToQueie(NotificationTypeProvider.Started, NotificationRespondProvider.ToDiscord, streams);
        this.#addToQueie(NotificationTypeProvider.Started, NotificationRespondProvider.ToTelegram, streams);
    }

    /**
     * Добавляет обновленные стримы в очередь
     * @param {StreamResponse[]} streams
     */
    #streamIsUpdated(streams) {
        this.#addToQueie(NotificationTypeProvider.Updated, NotificationRespondProvider.ToDiscord, streams);
        this.#addToQueie(NotificationTypeProvider.Updated, NotificationRespondProvider.ToTelegram, streams);
    }

    /**
     * Добавляет завершенные стримы в очередь
     * @param {StreamResponse[]} streams
     */
    #streamIsEnded(streams) {
        this.#addToQueie(NotificationTypeProvider.Ended, NotificationRespondProvider.ToDiscord, streams);
        this.#addToQueie(NotificationTypeProvider.Ended, NotificationRespondProvider.ToTelegram, streams);
    }

    /**
     * Добавляет стримы в очередь
     * @param {NotificationTypeProvider} type
     * @param {NotificationRespondProvider} target
     * @param {StreamResponse[]} streams
     */
    #addToQueie(type, target, streams) {
        this.queie.pushes(streams.map(x => new KeyValuePair(target, new NotificationRespond(type, target, x))));
    }

    /**
     * Запускает таймер обновления
     * @returns {Boolean} True если запуск был успешным
     */
    #tryStartTimer() {
        const isEmpty = !this.queie.collection.length > 0;

        if (!isEmpty && !this.timer) {
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
     * Останавливает таймер обновления
     * @returns {boolean} True если остановка была успешна
     */
    #tryStopTimer() {
        const isEmpty = !this.queie.collection.length > 0;

        if (isEmpty && this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
            return true;
        };
        return false;
    }

    /**
     * Срабатывает когда таймер отработал свой интервал
     */
    #onTimerCallback() {
        try {
            do {
                let result = false;

                const item = this.queie.collection[0];
                switch (item.key) {
                    case NotificationRespondProvider.ToDiscord:
                        result = this.#respondToDiscord(item.value);
                        break;
                    case NotificationRespondProvider.ToTelegram:
                        result = this.#respondToTelegram(item.value);
                        break;
                }

                if (result) {
                    this.queie.collection.shift();
                } else {
                    throw new Error('Respond not passed');
                }
            } while (this.queie.collection.length > 0);
            this.#tryStopTimer();
        }
        catch (e) {
            console.log(`Notification responds paused with error:${e}`);
            this.#tryStartTimer();
        }
    }

    /**
     * Отправляет сообщение в Discord
     * @param {NotificationRespond} arg
     * @returns
     */
    async #respondToDiscord(arg) {
        /** @type {TwitchNotificationBot} */
        const app = this.parent;
        /** @type {DiscordService}*/
        const discord = app.getService(DiscordService);

        if (discord) {
            try {
                const channel = await discord.getRespondChannel(this.discordGuildId, this.discordChannelId);
                
                switch (arg.type) {
                    case NotificationTypeProvider.Started: {
                        channel.send({
                            content: arg.type,
                            embeds: [this.#buildEmbedMessage(
                                arg.stream,
                                discord.client.user)]
                        });
                        break;
                    }
                    case NotificationTypeProvider.Updated: {
                        //Требуется придумать как обновлять сообщение, которое было ранее отправлено
                        break;
                    }
                    case NotificationTypeProvider.Ended: {
                        channel.send({
                            content: arg.type,
                            embeds: [this.#buildEmbedMessage(
                                arg.stream
                            )]
                        })
                        break;
                    }
                }

                return true;
            } catch (e) {
                console.log(`Respond to Discord error: ${e}`);
            }
        }

        return false;
    }

    /**
     * @param {NotificationTypeProvider} type
     * @param {StreamResponse} stream
     */
    async respondToDiscordAsyncTest(type, stream) {
        const arg = new NotificationRespond(type, NotificationRespondProvider.ToDiscord, stream)
        await this.#respondToDiscord(arg);
    }

    /**
     * https://discordjs.guide/popular-topics/embeds.html#using-the-embed-constructor
     * @param {StreamResponse} stream Стрим с твича
     * @param {User|undefined} discordUser Если указано, добавляет ссылку на пользователя Discord
     * @param {any|undefined} twitchGame Если указано, добавляет название и обложку игры
     * @param {EmbedField[]|undefined} embedFields Если указано, добавляет строки на каждое поле
     */
    #buildEmbedMessage(stream, discordUser, twitchGame, embedFields) {
        return new EmbedBuilder({
            title: stream.title,
            url: `https://www.twitch.tv/${stream.user_login}`,
            image: {
                url: stream.thumbnail_url.replace('{width}', 400).replace('{height}', 220)
            },

            ...discordUser && {
                author: {
                    name: discordUser.displayName,
                    icon_url: discordUser.avatarURL(),
                    url: discordUser.tag
                }
            },

            ...twitchGame && { description: twitchGame.game_name },
            ...twitchGame && { thumbnail: { url: stream.thumbnail_url } },
            
            ...embedFields && { fields: [embedFields] }
        });
    }

    /**
     * Отправляет сообщение в Telegram
     * @param {NotificationRespond} arg
     * @returns
     */
    async #respondToTelegram(arg) {
        /** @type {TelegramService} */
        const telegram = this.parent.getService(TelegramService);
        if (telegram) {
            try {
                const text = this.#pickAnnouncementText(arg.type) ?? "";
                switch (arg.type) {
                    case NotificationTypeProvider.Started: {
                        await telegram.client.sendPhoto(
                            this.telegramChannelId,
                            arg.stream.thumbnail_url.replace('{width}', 1024).replace('{height}', 800),
                            this.#buildTelegramOptions(arg.type, arg.stream, text)
                        )
                        break;
                    }
                    case NotificationTypeProvider.Ended: {
                        await telegram.client.sendMessage(
                            this.telegramChannelId,
                            text)
                        break;
                    }
                }
                return true;
            } catch (e) {
                console.log(`Respond to Telegram error: ${e}`);
            }
        }

        return false;
    }

    /**
     * @param {NotificationTypeProvider} type
     * @param {StreamResponse} stream
     */
    async respondToTelegramAsyncTest(type, stream) {
        const arg = new NotificationRespond(type, NotificationRespondProvider.ToTelegram, stream);
        await this.#respondToTelegram(arg);
    }

    /**
     * 
     * @param {NotificationTypeProvider} status
     * @param {StreamResponse} stream
     * @param {any} photo
     * @param {string} descriction
     * @returns
     */
    #buildTelegramOptions(status, stream, descriction = "") {
        console.log(`descriction: ${descriction}`);
        const options = {
            show_caption_above_media: true,
            parse_mode: 'HTML',
            ...this.telegramRespondThreadId && { message_thread_id: this.telegramRespondThreadId },
            ...descriction?.length > 0 && { caption: descriction },
            ...status === NotificationTypeProvider.Started && {
                reply_markup: {
                    inline_keyboard: [[{
                        text: 'Посетить стрим',
                        url: `https://www.twitch.tv/${stream.user_login}`,
                    }]]
                }
            }
        }
        return options;
    }

    /**
     * Взять из коллекции заготовленных ответов случайное сообщение
     * @param {NotificationTypeProvider} status Статус для которого будет выбрана коллекция
     * @returns {string|null} Сообщение, если статус соответствует "о начале стрима" или "конец стрима"
     */
    #pickAnnouncementText(status) {
        const getRandomItem = arr => arr[Math.floor(Math.random() * arr.length)];
        const result =
            status === NotificationTypeProvider.Started ? getRandomItem(this.messagesStartAnnouncement) :
            status === NotificationTypeProvider.Ended ? getRandomItem(this.messagesEndAnnouncement) :
            null;
        return result;//arr[Math.floor(Math.random() * arr.length)];
    }
    pickAnnouncementTextTest(status) {
        return this.#pickAnnouncementText(status);
    }
}

/**
 * @param {string} name
 * @param {string} value
 * @param {boolean|undefined} inline
 */
const EmbedField = function EmbedField(name, value, inline) {
    /** @type {string} */
    this.name = name;
    /** @type {string} */
    this.value = value;
    if (inline) {
        /** @type {boolean} */
        this.inline = inline;
    }
}

const NotificationRespond = class NotificationRespond {
    /**
     * Создает EventArgs класс для событий уведомлений статуса стрима
     * @param {NotificationTypeProvider} type Тип события
     * @param {NotificationRespondProvider} respondTo Событие, ориентируемое на что-то
     * @param {StreamResponse} stream Данные о стриме
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

module.exports = { NotificationService, NotificationRespond, NotificationRespondProvider, NotificationTypeProvider, NotificationEventProvider }