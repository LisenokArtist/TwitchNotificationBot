const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NotificationService } = require('../services/Notification/NotificationService');
const { StreamNotificationCache } = require('../services/Notification/StreamNotificationCache');

/**
 * @param {string} title
 * @param {string} [gameName]
 */
function stream(title, gameName = 'Chess') {
    return {
        user_login: 'bob',
        user_name: 'Bob',
        title,
        game_name: gameName,
        thumbnail_url: 'https://preview.example/{width}x{height}.jpg'
    };
}

describe('NotificationService stream update', function () {
    /** @type {typeof fetch | undefined} */
    let previousFetch;
    /** @type {string[]} */
    const files = [];

    afterEach(() => {
        if (previousFetch) {
            global.fetch = previousFetch;
            previousFetch = undefined;
        }
        for (const file of files.splice(0)) {
            fs.rmSync(file, { force: true });
            fs.rmSync(`${file}.${process.pid}.tmp`, { force: true });
        }
    });

    it('attaches a preview file and edits the same messages', async function () {
        previousFetch = global.fetch;
        global.fetch = async () => new Response(Buffer.from('jpeg-bytes'), { status: 200 });

        /** @type {object[]} */
        const discordCalls = [];
        /** @type {object[]} */
        const telegramCalls = [];
        const discordMessage = {
            /**
             * @param {object} payload
             */
            async edit(payload) {
                discordCalls.push({ edit: payload });
                return discordMessage;
            }
        };
        const discord = {
            client: {
                user: {
                    displayName: 'bot',
                    tag: 'bot#1',
                    avatarURL() {
                        return 'https://cdn.example/avatar.png';
                    }
                }
            },
            /**
             * @returns {Promise<{ send: (payload: object) => Promise<object> }>}
             */
            async getRespondChannel() {
                return {
                    /**
                     * @param {object} payload
                     */
                    async send(payload) {
                        discordCalls.push({ send: payload });
                        return discordMessage;
                    }
                };
            }
        };
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
                 * @param {object} media
                 * @param {object} extra
                 */
                async editMessageMedia(media, extra) {
                    telegramCalls.push({ editMessageMedia: { media, extra } });
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

        const service = new NotificationService(
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
        service.retryInSeconds = 0;

        service.onStreamStarted([stream('Hello')]);
        await new Promise((resolve) => setTimeout(resolve, 30));

        assert.equal(discordCalls.length, 1);
        const discordSend = /** @type {{ send: { files: Buffer[], embeds: { data: { image?: { url?: string }, title?: string, author?: { name?: string, url?: string, icon_url?: string } } }[] } }} */ (discordCalls[0]).send;
        assert.equal(discordSend.files.length, 1);
        assert.equal(discordSend.embeds[0].data.image?.url, 'attachment://preview.jpg');
        assert.equal(discordSend.embeds[0].data.title, 'Hello');
        assert.equal(discordSend.embeds[0].data.author?.name, 'bot');
        assert.equal(discordSend.embeds[0].data.author?.url, undefined);
        assert.equal(/** @type {{ content?: string }} */ (discordSend).content, 'Стрим начался!');
        const telegramStart = /** @type {{ sendPhoto: { photo: Buffer, options: { caption?: string } } }} */ (telegramCalls[0]).sendPhoto;
        assert.ok(Buffer.isBuffer(telegramStart.photo));
        assert.match(telegramStart.options.caption ?? '', /Стрим начался!\nHello/);

        service.messagesStartAnnouncement = ['Другой текст'];
        service.onStreamUpdated([stream('Next', 'Just Chatting')]);
        await new Promise((resolve) => setTimeout(resolve, 30));

        assert.equal(discordCalls.length, 2);
        const discordEdit = /** @type {{ edit: { content?: string, files: unknown[], embeds: { data: { title?: string, description?: string } }[] } }} */ (discordCalls[1]).edit;
        assert.equal(discordEdit.content, 'Стрим начался!');
        assert.equal(discordEdit.embeds[0].data.title, 'Next');
        assert.equal(discordEdit.embeds[0].data.description, 'Just Chatting');
        assert.equal(discordEdit.files.length, 1);
        const telegramEdit = /** @type {{ editMessageMedia: { media: { caption?: string }, extra: { message_id?: number } } }} */ (telegramCalls[1]).editMessageMedia;
        assert.equal(telegramEdit.extra.message_id, 7);
        assert.match(telegramEdit.media.caption ?? '', /Стрим начался!\nNext\nJust Chatting/);
    });

    it('restores sent messages after a restart and drops them when the stream ends', async function () {
        previousFetch = global.fetch;
        global.fetch = async () => new Response(Buffer.from('jpeg-bytes'), { status: 200 });

        const file = path.join(os.tmpdir(), `stream-notifications-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
        files.push(file);
        const cache = new StreamNotificationCache(file);
        /** @type {object[]} */
        const discordCalls = [];
        /** @type {object[]} */
        const telegramCalls = [];
        const discordMessage = {
            id: '555',
            /**
             * @param {object} payload
             */
            async edit(payload) {
                discordCalls.push({ edit: payload });
                return discordMessage;
            }
        };
        const service = notificationService(cache, discordCalls, telegramCalls, discordMessage);
        service.onStreamStarted([stream('Hello')]);
        await wait();

        const stored = cache.list();
        assert.equal(stored.length, 1);
        assert.equal(stored[0].discordMessageId, '555');
        assert.equal(stored[0].telegramMessageId, 7);
        assert.equal(stored[0].stream?.title, 'Hello');
        assert.equal(stored[0].announcement, 'Стрим начался!');

        /** @type {string[]} */
        const fetched = [];
        const resumedMessage = {
            id: '555',
            /**
             * @param {object} payload
             */
            async edit(payload) {
                discordCalls.push({ edit: payload });
                return resumedMessage;
            }
        };
        const resumed = notificationService(new StreamNotificationCache(file), discordCalls, telegramCalls, resumedMessage, fetched);
        await resumed.Start();
        discordCalls.length = 0;
        telegramCalls.length = 0;
        resumed.messagesStartAnnouncement = ['Другой текст'];
        resumed.onStreamUpdated([stream('Next', 'Just Chatting')]);
        await wait();

        assert.deepEqual(fetched, ['555']);
        assert.equal(discordCalls.some(call => 'send' in call), false);
        assert.equal(telegramCalls.some(call => 'sendPhoto' in call), false);
        const discordEdit = /** @type {{ edit: { content?: string, embeds: { data: { title?: string } }[] } }} */ (discordCalls[0]).edit;
        assert.equal(discordEdit.content, 'Стрим начался!');
        assert.equal(discordEdit.embeds[0].data.title, 'Next');
        const telegramEdit = /** @type {{ editMessageMedia: { media: { caption?: string }, extra: { message_id?: number } } }} */ (telegramCalls[0]).editMessageMedia;
        assert.equal(telegramEdit.extra.message_id, 7);
        assert.match(telegramEdit.media.caption ?? '', /Стрим начался!\nNext/);

        resumed.onStreamEnded([stream('Next', 'Just Chatting')]);
        await wait();
        assert.equal(new StreamNotificationCache(file).list().length, 0);
    });
});

/**
 * @returns {Promise<void>}
 */
function wait() {
    return new Promise((resolve) => setTimeout(resolve, 30));
}

/**
 * @param {StreamNotificationCache} cache
 * @param {object[]} discordCalls
 * @param {object[]} telegramCalls
 * @param {{ id: string, edit: (payload: object) => Promise<object> }} discordMessage
 * @param {string[]} [fetched]
 */
function notificationService(cache, discordCalls, telegramCalls, discordMessage, fetched = []) {
    const discord = {
        client: {
            user: {
                displayName: 'bot',
                tag: 'bot#1',
                avatarURL() {
                    return 'https://cdn.example/avatar.png';
                }
            }
        },
        /**
         * @returns {Promise<object>}
         */
        async getRespondChannel() {
            return {
                messages: {
                    /**
                     * @param {string} id
                     */
                    async fetch(id) {
                        fetched.push(id);
                        return discordMessage;
                    }
                },
                /**
                 * @param {object} payload
                 */
                async send(payload) {
                    discordCalls.push({ send: payload });
                    return discordMessage;
                }
            };
        }
    };
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
             * @param {object} media
             * @param {object} extra
             */
            async editMessageMedia(media, extra) {
                telegramCalls.push({ editMessageMedia: { media, extra } });
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
    const service = new NotificationService(
        {
            twitchMonitorChannelNames: ['bob'],
            discordGuildId: '1',
            discordRespondChannelId: '2',
            telegramRespondChannelId: '3',
            telegramRespondThreadId: null,
            messagesStartAnnouncement: ['Стрим начался!'],
            messagesEndAnnouncement: ['Стрим закончился.']
        },
        /** @type {import('../services/Twitch/TwitchService').TwitchService} */ ({
            setChannelsByName() {
            }
        }),
        /** @type {import('../services/Discord/DiscordService').DiscordService} */ (discord),
        /** @type {import('../services/Telegram/TelegramService').TelegramService} */ (telegram),
        cache
    );
    service.retryInSeconds = 0;
    return service;
}
