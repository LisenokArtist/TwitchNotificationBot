const path = require('node:path');
const fs = require('node:fs');
const filePath = path.join(__dirname, 'AppConfig.json');

class AppConfig {
    /**
     * ������� ����� � ������������ ����� �������
     * @param {DiscordConfig} discordConfig
     * @param {TwitchConfig} twitchConfig
     * @param {TelegramConfig} telegramConfig
     */
    constructor(discordConfig, twitchConfig, telegramConfig) {
        /** @type {DiscordConfig} */
        this.discordConfig = discordConfig;
        /** @type {TwitchConfig} */
        this.twitchConfig = twitchConfig;
        /** @type {TelegramConfig} */
        this.telegramConfig = telegramConfig;
    }

    /**
     * ��������� ���� ������������
     * @returns true ���� ���������� ���� �������
     */
    save() {
        const json = JSON.stringify(this);
        try {
            fs.writeFileSync(filePath, json);
            return true;
        } catch (e) {
            console.log('Unable to save app config file with error: ' + e);
        }
        return false;
    }

    /**
     * ��������� ���� ������������
     * @returns true ���� �������� ���� �������
     */
    load() {
        const isExists = fs.existsSync(filePath);
        if (isExists) {
            const file = fs.readFileSync(filePath, 'utf8');
            const result = JSON.parse(file);
            Object.assign(this, result);
            return true;
        }
        else {
            console.log('File ' + filePath + ' not found');
        }
        return false;
    }
}

class DiscordConfig {
    /**
     * ������� ����� � ����������� ��� ������ Discord
     * @param {String} token
     * @param {String} clientId
     * @param {String} guildId
     */
    constructor(token, clientId, guildId) {
        /** @type {String} */
        this.token = token;
        /** @type {String} */
        this.cliendId = clientId;
        /** @type {String} */
        this.guildId = guildId;
    }
}

class TwitchConfig {
    /**
     * ������� ����� � ����������� ��� ������ Twitch
     * @param {String} clientId
     * @param {String} secretId
     */
    constructor(clientId, secretId) {
        /** @type {String} */
        this.clientId = clientId;
        /** @type {String} */
        this.secretId = secretId;
    }
}

class TelegramConfig {
    /**
     * ������� ����� � ����������� ��� ������ Telegram
     * @param {String} token
     * @param {Number} chatId
     */
    constructor(token, chatId) {
        /** @type {String} */
        this.token = token
        /** @type {Number} */
        this.chatId = chatId;
    }
}

module.exports = { AppConfig, DiscordConfig, TwitchConfig, TelegramConfig };