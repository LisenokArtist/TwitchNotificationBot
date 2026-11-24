const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppConfig, DiscordConfig, TwitchConfig, TelegramConfig, NotificationConfig } = require('../config/AppConfig');
const { TwitchNotificationBot } = require('../TwitchNotificationBot');
const { TwitchService } = require('../services/Twitch/TwitchService');
const { NotificationService, NotificationRespondProvider } = require('../services/Notification/NotificationService');
const { TwitchClient, PollStrategy } = require('../twitch');

/** @type {string[]} */
const tokenFiles = [];

describe('service interaction', function () {
    /** @type {typeof TwitchService.prototype.setStreamObserver | undefined} */
    let originalSetObserver;
    /** @type {typeof fetch | undefined} */
    let previousFetch;
    /** @type {NotificationService | undefined} */
    let service;

    afterEach(() => {
        if (originalSetObserver) {
            TwitchService.prototype.setStreamObserver = originalSetObserver;
            originalSetObserver = undefined;
        }
        if (previousFetch) {
            global.fetch = previousFetch;
            previousFetch = undefined;
        }
        if (service?.timer) {
            clearTimeout(service.timer);
            service.timer = null;
        }
        for (const file of tokenFiles.splice(0)) {
            fs.rmSync(file, { force: true });
        }
    });

    it('wires the stream observer before Start', function () {
        /** @type {unknown[]} */
        const observers = [];
        originalSetObserver = TwitchService.prototype.setStreamObserver;
        TwitchService.prototype.setStreamObserver = function (observer) {
            observers.push(observer);
            return originalSetObserver?.call(this, observer);
        };

        const bot = new TwitchNotificationBot(botConfig());
        assert.equal(bot.isRunning, false);
        assert.equal(observers.length, 1);
        assert.equal(observers[0], bot.notificationService);
    });

    it('delivers a monitor event to the fake Discord and Telegram clients', async function () {
        previousFetch = global.fetch;
        global.fetch = async () => new Response(Buffer.from('jpeg-bytes'), { status: 200 });
        /** @type {object[]} */
        const discordCalls = [];
        /** @type {object[]} */
        const telegramCalls = [];
        service = notificationService(telegramCalls, async () => ({
            /**
             * @param {object} payload
             */
            async send(payload) {
                discordCalls.push({ send: payload });
                return { id: '1' };
            }
        }));
        service.retryInSeconds = 0;

        const strategy = liveStrategy();
        await strategy.start(['bob'], service);
        await wait();
        await strategy.stop();

        assert.equal(discordCalls.length, 1);
        const discordSend = /** @type {{ send: { embeds: { data: { title?: string } }[] } }} */ (discordCalls[0]).send;
        assert.equal(discordSend.embeds[0].data.title, 'Hello');
        assert.equal(telegramCalls.length, 1);
        assert.ok(Buffer.isBuffer(/** @type {{ sendPhoto: { photo: Buffer } }} */ (telegramCalls[0]).sendPhoto.photo));
        assert.equal(service.queue.length, 0);
    });

    it('starts and stops every stubbed service', async function () {
        /** @type {string[]} */
        const order = [];
        /**
         * @param {string} name
         */
        function stage(name) {
            return {
                async Start() {
                    order.push(`${name}:start`);
                },
                async Stop() {
                    order.push(`${name}:stop`);
                }
            };
        }

        const bot = new TwitchNotificationBot(botConfig());
        bot.services = [
            /** @type {import('../services/ServiceBase').ServiceBase} */ (stage('twitch')),
            /** @type {import('../services/ServiceBase').ServiceBase} */ (stage('discord')),
            /** @type {import('../services/ServiceBase').ServiceBase} */ (stage('telegram')),
            /** @type {import('../services/ServiceBase').ServiceBase} */ (stage('notification'))
        ];
        await bot.Start();
        assert.equal(bot.isRunning, true);
        await bot.Stop();
        assert.equal(bot.isRunning, false);
        assert.deepEqual(order, [
            'twitch:start',
            'discord:start',
            'telegram:start',
            'notification:start',
            'twitch:stop',
            'discord:stop',
            'telegram:stop',
            'notification:stop'
        ]);
    });

    it('keeps the notification when one recipient fails', async function () {
        /** @type {object[]} */
        const telegramCalls = [];
        service = notificationService(telegramCalls, async () => {
            service.retryInSeconds = 3600;
            throw new Error('discord down');
        });
        service.retryInSeconds = 0;
        const live = {
            user_login: 'bob',
            user_name: 'Bob',
            title: 'Hello',
            game_name: 'Chess',
            thumbnail_url: 'https://img/{width}x{height}.jpg'
        };

        service.onStreamStarted([live]);
        await wait();

        assert.equal(service.queue.length, 2);
        assert.equal(service.queue.peek()?.respondTo, NotificationRespondProvider.ToDiscord);
        assert.equal(service.queue.peek()?.stream.title, 'Hello');
        assert.equal(telegramCalls.length, 0);
    });
});

/**
 * @returns {AppConfig}
 */
function botConfig() {
    return new AppConfig(
        new DiscordConfig(),
        new TwitchConfig(),
        new TelegramConfig(),
        new NotificationConfig(['bob'], '', '', '', null, ['Стрим начался!'], ['Стрим закончился.'])
    );
}

/**
 * @param {object[]} telegramCalls
 * @param {(guildId: string, channelId: string) => Promise<object>} getRespondChannel
 * @returns {NotificationService}
 */
function notificationService(telegramCalls, getRespondChannel) {
    const discord = { getRespondChannel };
    const telegram = {
        client: {
            /**
             * @param {string} chatId
             * @param {Buffer} photo
             * @param {object} options
             */
            async sendPhoto(chatId, photo, options) {
                telegramCalls.push({ sendPhoto: { chatId, photo, options } });
                return { message_id: 7 };
            },
            /**
             * @param {string} chatId
             * @param {string} text
             */
            async sendMessage(chatId, text) {
                telegramCalls.push({ sendMessage: { chatId, text } });
            }
        }
    };
    return new NotificationService(
        {
            twitchMonitorChannelNames: ['bob'],
            discordGuildId: '1',
            discordRespondChannelId: '2',
            telegramRespondChannelId: '3',
            telegramRespondThreadId: null,
            messagesStartAnnouncement: ['Стрим начался!'],
            messagesEndAnnouncement: ['Стрим закончился.']
        },
        /** @type {import('../services/Twitch/TwitchService').TwitchService} */ ({}),
        /** @type {import('../services/Discord/DiscordService').DiscordService} */ (discord),
        /** @type {import('../services/Telegram/TelegramService').TelegramService} */ (telegram)
    );
}

/**
 * @returns {PollStrategy}
 */
function liveStrategy() {
    const tokenFile = path.join(os.tmpdir(), `twitch-token-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
    tokenFiles.push(tokenFile);
    const client = new TwitchClient({
        clientId: 'client',
        clientSecret: 'secret',
        tokenFile,
        fetch: async (url) => {
            const href = String(url);
            if (href.includes('/oauth2/token')) {
                return jsonResponse(200, { access_token: 'token-a', expires_in: 3600, token_type: 'bearer' });
            }
            return jsonResponse(200, {
                data: [{
                    user_login: 'bob',
                    user_name: 'Bob',
                    title: 'Hello',
                    game_name: 'Chess',
                    thumbnail_url: 'https://img/{width}x{height}.jpg'
                }]
            });
        }
    });
    return new PollStrategy(client, 10, {
        previewRefreshMinutes: 30,
        clock: { every() {}, stop() {} }
    });
}

/**
 * @param {number} status
 * @param {unknown} body
 * @returns {Response}
 */
function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * @returns {Promise<void>}
 */
function wait() {
    return new Promise((resolve) => setTimeout(resolve, 30));
}
