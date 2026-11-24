const assert = require('node:assert/strict');
const { NotificationService } = require('../services/Notification/NotificationService');

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

    afterEach(() => {
        if (previousFetch) {
            global.fetch = previousFetch;
            previousFetch = undefined;
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
        const discordSend = /** @type {{ send: { files: Buffer[], embeds: { data: { image?: { url?: string }, title?: string } }[] } }} */ (discordCalls[0]).send;
        assert.equal(discordSend.files.length, 1);
        assert.equal(discordSend.embeds[0].data.image?.url, 'attachment://preview.jpg');
        assert.equal(discordSend.embeds[0].data.title, 'Hello');
        assert.ok(Buffer.isBuffer(telegramCalls[0] && /** @type {{ sendPhoto: { photo: Buffer } }} */ (telegramCalls[0]).sendPhoto.photo));

        service.onStreamUpdated([stream('Next', 'Just Chatting')]);
        await new Promise((resolve) => setTimeout(resolve, 30));

        assert.equal(discordCalls.length, 2);
        const discordEdit = /** @type {{ edit: { files: unknown[], embeds: { data: { title?: string, description?: string } }[] } }} */ (discordCalls[1]).edit;
        assert.equal(discordEdit.embeds[0].data.title, 'Next');
        assert.equal(discordEdit.embeds[0].data.description, 'Just Chatting');
        assert.equal(discordEdit.files.length, 1);
        const telegramEdit = /** @type {{ editMessageMedia: { media: { caption?: string }, extra: { message_id?: number } } }} */ (telegramCalls[1]).editMessageMedia;
        assert.equal(telegramEdit.extra.message_id, 7);
        assert.match(telegramEdit.media.caption ?? '', /Next/);
        assert.match(telegramEdit.media.caption ?? '', /Just Chatting/);
    });
});
