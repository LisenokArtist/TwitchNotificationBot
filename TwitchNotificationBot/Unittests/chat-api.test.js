const assert = require('node:assert/strict');
const { DiscordConfig, TelegramConfig } = require('../config/AppConfig');
const { DiscordService } = require('../services/Discord/DiscordService');
const { TelegramService } = require('../services/Telegram/TelegramService');

describe('Discord and Telegram clients', function () {
    it('waits for Discord login and closes the client on Stop', async function () {
        let releaseLogin = () => {};
        const loginGate = new Promise((resolve) => {
            releaseLogin = resolve;
        });
        let loginFinished = false;
        /** @type {string[]} */
        const tokens = [];
        let destroyed = false;
        const client = {
            isReady() {
                return false;
            },
            /**
             * @param {string} token
             */
            async login(token) {
                tokens.push(token);
                await loginGate;
                loginFinished = true;
                return token;
            },
            async destroy() {
                destroyed = true;
            }
        };

        const service = new DiscordService(new DiscordConfig('bot-token', 'client', 'guild'));
        service.isInitializated = true;
        service.client = /** @type {import('discord.js').Client} */ (client);

        let started = false;
        const starting = service.Start().then(() => {
            started = true;
        });
        await wait();
        assert.equal(started, false);
        assert.equal(loginFinished, false);
        assert.deepEqual(tokens, ['bot-token']);

        releaseLogin();
        await starting;
        assert.equal(started, true);
        assert.equal(loginFinished, true);

        await service.Stop();
        assert.equal(destroyed, true);
    });

    it('skips Telegram polling without a token and stops polling on Stop', async function () {
        const service = new TelegramService(new TelegramConfig(''));
        await service.Start();
        assert.equal(service.client, null);
        assert.equal(service.isInitializated, true);

        let stopped = false;
        service.client = /** @type {import('node-telegram-bot-api')} */ ({
            async stopPolling() {
                stopped = true;
            }
        });
        await service.Stop();
        assert.equal(stopped, true);
        assert.equal(service.client, null);
        assert.equal(service.isInitializated, false);
    });
});

/**
 * @returns {Promise<void>}
 */
function wait() {
    return new Promise((resolve) => setTimeout(resolve, 30));
}
