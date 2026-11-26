const { ServiceBase } = require('../ServiceBase');
const { NotificationConfig } = require('../../config/AppConfig');
const { Queue } = require('../../domain/Queue');
const { StreamResponse } = require('../../domain/twitch/TwitchApiModels');
const { AttachmentBuilder, EmbedBuilder, User } = require('discord.js');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * @typedef {object} DiscordMessageHandle
 * @property {string} [id]
 * @property {(payload: object) => Promise<DiscordMessageHandle>} edit
 */

/**
 * @typedef {object} SentStreamMessage
 * @property {DiscordMessageHandle | null} discord
 * @property {string | null} discordMessageId
 * @property {number | null} telegramMessageId
 * @property {boolean} discordClosed
 * @property {boolean} telegramClosed
 * @property {string} announcement
 */

/** @typedef {import('./StreamNotificationCache').StreamNotificationCache} StreamNotificationCache */

/** @typedef {import('../Twitch/TwitchService').TwitchService} TwitchService */
/** @typedef {import('../Discord/DiscordService').DiscordService} DiscordService */
/** @typedef {import('../Telegram/TelegramService').TelegramService} TelegramService */

class NotificationService extends ServiceBase {

    /**
     * @param {NotificationConfig} config
     * @param {TwitchService} twitch
     * @param {DiscordService} discord
     * @param {TelegramService} telegram
     * @param {StreamNotificationCache | null} [notifications]
     */
    constructor(config, twitch, discord, telegram, notifications = null) {
        super();

        /** @type {TwitchService} */
        this.twitch = twitch;
        /** @type {DiscordService} */
        this.discord = discord;
        /** @type {TelegramService} */
        this.telegram = telegram;

        /** @type {String[]} */
        this.twitchChannelNames = config.twitchMonitorChannelNames;

        /** @type {string} */
        this.discordGuildId = config.discordGuildId;
        /** @type {string} */
        this.discordChannelId = config.discordRespondChannelId;

        /** @type {string} */
        this.telegramChannelId = config.telegramRespondChannelId;
        /** @type {string|null} */
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

        /** @type {Map<string, SentStreamMessage>} */
        this.#sent = new Map();
        /** @type {{ key: string, buffer: Buffer, at: number } | null} */
        this.#previewCache = null;
        /** @type {StreamNotificationCache | null} */
        this.#notifications = notifications;
    }

    /** @type {Map<string, SentStreamMessage>} */
    #sent;
    /** @type {{ key: string, buffer: Buffer, at: number } | null} */
    #previewCache;
    /** @type {StreamNotificationCache | null} */
    #notifications;

    async Start() {
        if (this.isInitializated) {
            return;
        }

        // Пропускаем инициализацию
        this.isInitializated = true;
        // Номера сообщений нужны до первого опроса, иначе живой эфир уйдёт как новый старт.
        this.#notifications?.load();
        this.#loadSent();
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
     * Правит уже отправленные сообщения и заменяет прикреплённое превью.
     * @param {StreamResponse[]} streams
     */
    onStreamUpdated(streams) {
        this.#onStreamStatus(streams, 'was updated', () => this.#streamIsUpdated(streams));
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
        if (!this.#targetEnabled(target)) {
            return;
        }

        for (const stream of streams) {
            this.queue.enqueue(new NotificationRespond(type, target, stream));
        }
    }

    /**
     * Пустая платформа не попадает в очередь и не блокирует вторую.
     * @param {NotificationRespondProvider} target
     * @returns {boolean}
     */
    #targetEnabled(target) {
        const service = target === NotificationRespondProvider.ToDiscord ? this.discord : this.telegram;
        if (!service) {
            return false;
        }
        if (typeof service.isEnabled === 'function') {
            return service.isEnabled();
        }

        return true;
    }

    /**
     * Отключённый чат считается уже закрытым, чтобы запись уведомления можно было удалить.
     * @param {SentStreamMessage} sent
     */
    #closeDisabled(sent) {
        if (!this.#targetEnabled(NotificationRespondProvider.ToDiscord)) {
            sent.discord = null;
            sent.discordMessageId = null;
            sent.discordClosed = true;
        }
        if (!this.#targetEnabled(NotificationRespondProvider.ToTelegram)) {
            sent.telegramMessageId = null;
            sent.telegramClosed = true;
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
        if (!this.#targetEnabled(NotificationRespondProvider.ToDiscord)) {
            return true;
        }

        if (discord) {
            try {
                const channel = await discord.getRespondChannel(this.discordGuildId, this.discordChannelId);
                
                switch (arg.type) {
                    case NotificationTypeProvider.Started:
                    case NotificationTypeProvider.Updated: {
                        const announcement = this.#startAnnouncement(arg.stream);
                        const preview = await this.#loadPreview(arg.stream);
                        const file = new AttachmentBuilder(preview, { name: 'preview.jpg' });
                        const embed = this.#buildEmbedMessage(
                            arg.stream,
                            arg.type === NotificationTypeProvider.Started ? discord.client?.user || undefined : undefined,
                            undefined,
                            undefined,
                            'attachment://preview.jpg'
                        );
                        const sent = this.#sent.get(streamKey(arg.stream)) ?? null;
                        const existing = sent && !sent.discordClosed
                            ? await this.#openDiscordMessage(channel, sent)
                            : null;
                        if (arg.type === NotificationTypeProvider.Started && !existing) {
                            const message = await channel.send({
                                content: announcement,
                                embeds: [embed],
                                files: [file]
                            });
                            this.#remember(arg.stream, { discord: message });
                            break;
                        }

                        if (!existing) {
                            return false;
                        }

                        const edited = await existing.edit({
                            content: announcement,
                            embeds: [embed],
                            files: [file],
                            attachments: []
                        });
                        this.#remember(arg.stream, { discord: edited });
                        break;
                    }
                    case NotificationTypeProvider.Ended: {
                        const sent = this.#sent.get(streamKey(arg.stream));
                        if (sent?.discordClosed) {
                            break;
                        }

                        await channel.send({
                            content: this.#pickAnnouncementText(NotificationTypeProvider.Ended) ?? '',
                            embeds: [this.#buildEmbedMessage(arg.stream)]
                        });
                        this.#finish(arg.stream, 'discord');
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
     * @param {User|undefined} discordUser Если указано, показывает его имя и аватар в шапке сообщения
     * @param {any|undefined} twitchGame Если указано, добавляет название и обложку игры
     * @param {EmbedField[]|undefined} embedFields Если указано, добавляет строки на каждое поле
     * @param {string|undefined} imageUrl Адрес картинки внутри сообщения. Внешнюю ссылку Twitch не используем: она пропадает.
     */
    #buildEmbedMessage(stream, discordUser = undefined, twitchGame = undefined, embedFields = undefined, imageUrl = undefined) {
        return new EmbedBuilder({
            title: stream.title,
            url: `https://www.twitch.tv/${stream.user_login}`,
            ...stream.game_name && { description: stream.game_name },
            ...imageUrl && { image: { url: imageUrl } },

            // tag вида «имя#1234» не является ссылкой. Discord принимает в author.url только http или https.
            ...discordUser && { author: discordAuthor(discordUser) },

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
        if (!this.#targetEnabled(NotificationRespondProvider.ToTelegram)) {
            return true;
        }

        if (telegram && telegram.client) {
            try {
                const text = this.#pickAnnouncementText(arg.type) ?? "";
                switch (arg.type) {
                    case NotificationTypeProvider.Started:
                    case NotificationTypeProvider.Updated: {
                        const preview = await this.#loadPreview(arg.stream);
                        const caption = this.#streamCaption(arg.stream);
                        const options = this.#buildTelegramOptions(arg.type, arg.stream, caption);
                        const sent = this.#sent.get(streamKey(arg.stream)) ?? null;
                        const messageId = sent && !sent.telegramClosed ? sent.telegramMessageId : null;
                        if (arg.type === NotificationTypeProvider.Started && messageId == null) {
                            const message = await telegram.client.sendPhoto(
                                this.telegramChannelId,
                                preview,
                                options,
                                { filename: 'preview.jpg', contentType: 'image/jpeg' }
                            );
                            const createdId = readMessageId(message);
                            if (createdId === null) {
                                return false;
                            }

                            this.#remember(arg.stream, { telegramMessageId: createdId });
                            break;
                        }

                        if (messageId == null) {
                            return false;
                        }

                        await this.#editTelegramPhoto(messageId, preview, caption, options.reply_markup);
                        this.#remember(arg.stream, { telegramMessageId: messageId });
                        break;
                    }
                    case NotificationTypeProvider.Ended: {
                        const sent = this.#sent.get(streamKey(arg.stream));
                        if (sent?.telegramClosed) {
                            break;
                        }

                        await telegram.client.sendMessage(
                            this.telegramChannelId,
                            text);
                        this.#finish(arg.stream, 'telegram');
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
            ...(status === NotificationTypeProvider.Started || status === NotificationTypeProvider.Updated) && {
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

    /**
     * @param {StreamResponse} stream
     * @param {Partial<SentStreamMessage>} patch
     */
    #remember(stream, patch) {
        const key = streamKey(stream);
        const current = this.#sent.get(key) ?? emptySent();
        const next = { ...current, ...patch, discordClosed: false, telegramClosed: false };
        const discordMessageId = readDiscordMessageId(next.discord);
        if (discordMessageId) {
            next.discordMessageId = discordMessageId;
        }
        this.#closeDisabled(next);
        this.#sent.set(key, next);
        this.#notifications?.save(key, {
            discordMessageId: next.discordMessageId,
            telegramMessageId: next.telegramMessageId,
            discordClosed: next.discordClosed,
            telegramClosed: next.telegramClosed,
            ...next.announcement.length > 0 && { announcement: next.announcement },
            stream,
            shownAt: Date.now()
        });
    }

    /**
     * Отмечает чат, которому уже отправлен конец стрима.
     * Запись удаляется, когда закрыты оба чата.
     * @param {StreamResponse} stream
     * @param {'discord' | 'telegram'} target
     */
    #finish(stream, target) {
        const key = streamKey(stream);
        const current = this.#sent.get(key) ?? emptySent();
        if (target === 'discord') {
            current.discord = null;
            current.discordMessageId = null;
            current.discordClosed = true;
        } else {
            current.telegramMessageId = null;
            current.telegramClosed = true;
        }

        this.#closeDisabled(current);
        if (current.discordClosed && current.telegramClosed) {
            this.#sent.delete(key);
            this.#notifications?.remove(key);
            return;
        }

        this.#sent.set(key, current);
        this.#notifications?.save(key, {
            discordMessageId: current.discordMessageId,
            telegramMessageId: current.telegramMessageId,
            discordClosed: current.discordClosed,
            telegramClosed: current.telegramClosed
        });
    }

    /**
     * @param {{ messages?: { fetch?: (id: string) => Promise<DiscordMessageHandle> } }} channel
     * @param {SentStreamMessage} sent
     * @returns {Promise<DiscordMessageHandle | null>}
     */
    async #openDiscordMessage(channel, sent) {
        if (sent.discord) {
            return sent.discord;
        }
        if (typeof sent.discordMessageId !== 'string' || sent.discordMessageId.length === 0) {
            return null;
        }
        if (typeof channel.messages?.fetch !== 'function') {
            return null;
        }

        const message = await channel.messages.fetch(sent.discordMessageId);
        sent.discord = message;
        return message;
    }

    /**
     * Поднимает номера сообщений из файла до старта наблюдения.
     */
    #loadSent() {
        if (!this.#notifications) {
            return;
        }

        for (const record of this.#notifications.list()) {
            this.#sent.set(record.login, {
                discord: null,
                discordMessageId: record.discordMessageId,
                telegramMessageId: record.telegramMessageId,
                discordClosed: record.discordClosed,
                telegramClosed: record.telegramClosed,
                announcement: record.announcement
            });
        }
    }

    /**
     * Скачивает превью один раз для пары Discord и Telegram.
     * @param {StreamResponse} stream
     * @returns {Promise<Buffer>}
     */
    async #loadPreview(stream) {
        const key = `${stream.user_login}|${stream.title}|${stream.game_name}`;
        const cached = this.#previewCache;
        if (cached && cached.key === key && Date.now() - cached.at < 15000) {
            return cached.buffer;
        }

        if (typeof stream.thumbnail_url !== 'string' || stream.thumbnail_url.length === 0) {
            throw new Error('У стрима нет адреса превью');
        }

        const url = stream.thumbnail_url.replaceAll('{width}', '1280').replaceAll('{height}', '720');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Превью не скачано: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        this.#previewCache = { key, buffer, at: Date.now() };
        return buffer;
    }

    /**
     * Один раз выбирает текст начала и держит его до конца стрима.
     * Повторный выбор на обновлении заменил бы анонс другим случайным сообщением.
     * @param {StreamResponse} stream
     * @returns {string}
     */
    #startAnnouncement(stream) {
        const key = streamKey(stream);
        const current = this.#sent.get(key);
        if (current && current.announcement.length > 0) {
            return current.announcement;
        }

        const text = this.#pickAnnouncementText(NotificationTypeProvider.Started) ?? '';
        if (text.length === 0) {
            return '';
        }

        const next = { ...(current ?? emptySent()), announcement: text };
        this.#sent.set(key, next);
        if (current && (current.discordMessageId || current.telegramMessageId || current.discord)) {
            this.#notifications?.save(key, { announcement: text });
        }
        return text;
    }

    /**
     * @param {StreamResponse} stream
     * @returns {string}
     */
    #streamCaption(stream) {
        const announcement = this.#startAnnouncement(stream);
        const lines = [];
        if (announcement.length > 0) {
            lines.push(escapeHtml(announcement));
        }
        if (stream.title) {
            lines.push(escapeHtml(stream.title));
        }
        if (stream.game_name) {
            lines.push(escapeHtml(stream.game_name));
        }

        return lines.join('\n');
    }

    /**
     * Заменяет фото у уже отправленного сообщения. Ссылка на CDN Twitch не сохраняется.
     * @param {number} messageId
     * @param {Buffer} preview
     * @param {string} caption
     * @param {object|undefined} replyMarkup
     * @returns {Promise<void>}
     */
    async #editTelegramPhoto(messageId, preview, caption, replyMarkup) {
        const client = this.telegram.client;
        if (!client) {
            throw new Error('Telegram client is not started');
        }

        const file = path.join(os.tmpdir(), `twitch-preview-${messageId}-${Date.now()}.jpg`);
        await fs.promises.writeFile(file, preview);
        try {
            await client.editMessageMedia({
                type: 'photo',
                media: `attach://${file}`,
                caption,
                parse_mode: 'HTML',
                fileOptions: { filename: 'preview.jpg', contentType: 'image/jpeg' }
            }, {
                chat_id: this.telegramChannelId,
                message_id: messageId,
                ...replyMarkup && { reply_markup: replyMarkup }
            });
        } finally {
            await fs.promises.rm(file, { force: true });
        }
    }
}

/**
 * @param {StreamResponse} stream
 * @returns {string}
 */
function streamKey(stream) {
    return stream.user_login.toLowerCase();
}

/**
 * @returns {SentStreamMessage}
 */
function emptySent() {
    return {
        discord: null,
        discordMessageId: null,
        telegramMessageId: null,
        discordClosed: false,
        telegramClosed: false,
        announcement: ''
    };
}

/**
 * @param {DiscordMessageHandle | null} message
 * @returns {string | null}
 */
function readDiscordMessageId(message) {
    if (!message || typeof message.id !== 'string' || message.id.length === 0) {
        return null;
    }

    return message.id;
}

/**
 * @param {unknown} message
 * @returns {number | null}
 */
function readMessageId(message) {
    if (!message || typeof message !== 'object' || !('message_id' in message)) {
        return null;
    }

    const id = /** @type {{ message_id?: unknown }} */ (message).message_id;
    return typeof id === 'number' ? id : null;
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
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

/**
 * Имя и аватар в шапке сообщения. Ссылка не ставится: tag пользователя не является http-адресом.
 * @param {{ displayName?: string, username?: string, avatarURL?: () => string | null }} user
 */
function discordAuthor(user) {
    const icon = typeof user.avatarURL === 'function' ? user.avatarURL() : null;
    return {
        name: user.displayName || user.username || 'Discord',
        ...icon && { icon_url: icon }
    };
}

module.exports = { NotificationService, NotificationRespond, NotificationRespondProvider, NotificationTypeProvider }