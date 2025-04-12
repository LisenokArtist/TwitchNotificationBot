const { ServiceBase } = require('../ServiceBase');
const TelegramBot = require('node-telegram-bot-api');
const { TelegramConfig } = require('../../Core/AppConfig');

const TelegramService = class TelegramService extends ServiceBase {
    /** @param {TelegramConfig} config */
    constructor(config) {
        super();

        /** @type {String} */
        this.token = config.token;

        this.client = new TelegramBot(this.token, { polling: true });
    }

    async Start() {
        // ���������� �������������
        this.isInitializated = true;
        console.log('TelegramServise is not require to start');
    }

    async Stop() {
        console.log('TelegramServise is not require to stop');
    }
}

module.exports = { TelegramService }