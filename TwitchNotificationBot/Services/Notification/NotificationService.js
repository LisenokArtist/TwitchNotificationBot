const { ServiceBase } = require('../ServiceBase');
const { NotificationConfig } = require('../../Core/AppConfig');
const { Queue } = require('../../Core/Collections/Queue');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels');
const { EmbedBuilder, User } = require('discord.js');
/** @typedef {import('../Twitch/TwitchService').TwitchService} TwitchService */
/** @typedef {import('../Discord/DiscordService').DiscordService} DiscordService */
/** @typedef {import('../Telegram/TelegramService').TelegramService} TelegramService */

class NotificationService extends ServiceBase {

    /**
     * @param {NotificationConfig} config
     * @param {TwitchService} twitch
     * @param {DiscordService} discord
     * @param {TelegramService} telegram
     */
    constructor(config, twitch, discord, telegram) {
        super();

        /** @type {TwitchService} */
        this.twitch = twitch;
        /** @type {DiscordService} */
        this.discord = discord;
        /** @type {TelegramService} */
        this.telegram = telegram;

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

        /** @type {Queue<NotificationRespond>} */
        this.queue = new Queue();

        /** @type {NodeJS.Timeout|null}*/
        this.timer = null;
    }

    async Start() {
        if (this.isInitializated) {
            return;
        }

        // Пропускаем инициализацию
        this.isInitializated = true;
        this.#registerSettings();
    }

    async Stop() {
        console.log('NotificationService is not require to stop');
    }

    /**
     * Регистрирует настройки
     */
    #registerSettings() {
        this.twitch.setChannelsByName(this.twitchChannelNames);
    }

    /**
     * Стрим начался.
     * @param {StreamResponse[]} streams
     */
    onStreamStarted(streams) {
        this.#onStreamStatus(streams, 'is now live', () => this.#streamIsStarted(streams));
    }

    /**
     * Данные стрима обновились.
     * Уведомление не отправляется: нужно обновлять уже отправленную запись в чате.
     * @param {StreamResponse[]} streams
     */
    onStreamUpdated(streams) {
    }

    /**
     * Стрим завершился.
     * @param {StreamResponse[]} streams
     */
    onStreamEnded(streams) {
        this.#onStreamStatus(streams, 'is now offline', () => this.#streamIsEnded(streams));
    }

    /**
     * Ставит стримы в очередь и пишет статус в лог.
     * @param {StreamResponse[]} streams
     * @param {string} statusText
     * @param {() => void} enqueue
     */
    #onStreamStatus(streams, statusText, enqueue) {
        try {
            enqueue();
            console.log(streams.map(s => `Stream of ${s.user_name} ${statusText}`).join(', '));
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
        for (const stream of streams) {
            this.queue.enqueue(new NotificationRespond(type, target, stream));
        }
    }

    /**
     * Запускает таймер обновления
     * @returns {Boolean} True если запуск был успешным
     */
    #tryStartTimer() {
        if (this.queue.length === 0 || this.timer) {
            return false;
        }

        const timer = setTimeout(() => {
            clearTimeout(timer);
            this.timer = null;
            this.#onTimerCallback();
        }, this.retryInSeconds * 1000);
        this.timer = timer;
        return true;
    }


    /**
     * Останавливает таймер обновления
     * @returns {boolean} True если остановка была успешна
     */
    #tryStopTimer() {
        if (this.queue.length > 0 || !this.timer) {
            return false;
        }

        clearTimeout(this.timer);
        this.timer = null;
        return true;
    }

    /**
     * Срабатывает когда таймер отработал свой интервал
     */
    async #onTimerCallback() {
        try {
            do {
                const item = this.queue.peek();
                if (!item) {
                    break;
                }

                let result = false;
                switch (item.respondTo) {
                    case NotificationRespondProvider.ToDiscord:
                        result = await this.#respondToDiscord(item);
                        break;
                    case NotificationRespondProvider.ToTelegram:
                        result = await this.#respondToTelegram(item);
                        break;
                }

                if (!result) {
                    throw new Error('Respond not passed');
                }

                this.queue.dequeue();
            } while (this.queue.length > 0);
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
        /** @type {DiscordService}*/
        const discord = this.discord;

        if (discord) {
            try {
                const channel = await discord.getRespondChannel(this.discordGuildId, this.discordChannelId);
                
                switch (arg.type) {
                    case NotificationTypeProvider.Started: {
                        await channel.send({
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
                        await channel.send({
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
        const telegram = this.telegram;
        if (telegram && telegram.client) {
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

module.exports = { NotificationService, NotificationRespond, NotificationRespondProvider, NotificationTypeProvider }