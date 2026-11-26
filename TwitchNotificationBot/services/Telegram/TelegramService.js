const { ServiceBase } = require('../ServiceBase');
const TelegramBot = require('node-telegram-bot-api');
const { TelegramConfig } = require('../../config/AppConfig');

const TelegramService = class TelegramService extends ServiceBase {
    /** @param {TelegramConfig} config */
    constructor(config) {
        super();

        /** @type {String} */
        this.token = config.token;

        // ?????? ????????? ? Start: ?????? ????? ?? ?????? ????????? polling.
        /** @type {TelegramBot | null} */
        this.client = null;
    }

    /**
     * ????????? ????????, ????? ? ??? ???? ?????.
     * @returns {boolean}
     */
    isEnabled() {
        return this.token.trim().length > 0;
    }

    async Start() {
        if (this.isInitializated) {
            return;
        }

        if (!this.isEnabled()) {
            console.log('TelegramService skipped: token is empty');
            this.isInitializated = true;
            return;
        }

        this.client = new TelegramBot(this.token, { polling: true });
        this.isInitializated = true;
    }

    async Stop() {
        if (!this.client) {
            return;
        }

        try {
            await this.client.stopPolling();
        } catch (e) {
            console.log(`TelegramService stop failed: ${e}`);
        }

        this.client = null;
        this.isInitializated = false;
    }
}

module.exports = { TelegramService }
