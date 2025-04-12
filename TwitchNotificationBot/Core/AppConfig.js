const path = require('node:path');
const fs = require('node:fs');
const filePath = path.join(__dirname, 'AppConfig.json');

class AppConfig {
    /**
     * Создает класс с найстройками всего решения
     * @param {DiscordConfig} discordConfig
     * @param {TwitchConfig} twitchConfig
     * @param {TelegramConfig} telegramConfig
     * @param {NotificationConfig} notificationConfig
     */
    constructor(discordConfig, twitchConfig, telegramConfig, notificationConfig) {
        /** @type {DiscordConfig} */
        this.discordConfig = discordConfig ?? new DiscordConfig();
        /** @type {TwitchConfig} */
        this.twitchConfig = twitchConfig ?? new TwitchConfig();
        /** @type {TelegramConfig} */
        this.telegramConfig = telegramConfig ?? new TelegramConfig();
        /** @type {NotificationConfig} */
        this.notificationConfig = notificationConfig ?? new NotificationConfig();
    }

    /**
     * Сохраняет файл конфигурации
     * @returns true если сохранение было успешно
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
     * Загружает файл конфигурации
     * @returns true если загрузка была успешна
     */
    load() {
        const isExists = fs.existsSync(filePath);
        if (isExists) {
            const file = fs.readFileSync(filePath, 'utf8');
            /** @type {this} */
            const result = JSON.parse(file);
            Object.assign(this, new AppConfig(
                new DiscordConfig(
                    result?.discordConfig?.token,
                    result?.discordConfig?.cliendId,
                    result?.discordConfig?.guildId
                ),
                new TwitchConfig(
                    result?.twitchConfig?.clientId,
                    result?.twitchConfig?.secretId
                ),
                new TelegramConfig(
                    result?.telegramConfig?.token
                ),
                new NotificationConfig(
                    result?.notificationConfig?.twitchMonitorChannelNames,
                    result?.notificationConfig?.discordGuildId,
                    result?.notificationConfig?.discordRespondChannelId,
                    result?.notificationConfig?.telegramRespondChannelId,
                    result?.notificationConfig?.telegramRespondThreadId,
                    result?.notificationConfig?.messagesStartAnnouncement,
                    result?.notificationConfig?.messagesEndAnnouncement
                )
            ));
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
     * Создает класс с настройками для модуля Discord
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
     * Создает класс с настройками для модуля Twitch
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
     * Создает класс с настройками для модуля Telegram
     * @param {String} token
     * @param {Number} chatId
     */
    constructor(token) {
        /** @type {String} */
        this.token = token;
    }
}

class NotificationConfig {
    constructor(
        channels,
        discordGuildId,
        discordChannelId,
        telegramChannelId,
        telegramThreadId,
        messagesStartAnnouncement,
        messagesEndAnnouncement) {
        /** @type {string[]} */
        this.twitchMonitorChannelNames = channels;

        /** @type {number} */
        this.discordGuildId = discordGuildId ? Number.parseInt(discordGuildId) : undefined;
        /** @type {number} */
        this.discordRespondChannelId = discordGuildId ? Number.parseInt(discordChannelId) : undefined;

        /** @type {number} */
        this.telegramRespondChannelId = discordGuildId ? Number.parseInt(telegramChannelId) : undefined;
        /** @type {number} */
        this.telegramRespondThreadId = telegramThreadId ? Number.parseInt(telegramThreadId) : undefined;

        /** @type {string[]} */
        this.messagesStartAnnouncement = messagesStartAnnouncement?.length > 0 ? messagesStartAnnouncement : ['Стрим начался!'];
        /** @type {string[]} */
        this.messagesEndAnnouncement = messagesEndAnnouncement?.length > 0 ? messagesEndAnnouncement : ['Стрим закончился.'];
    }
}

module.exports = { AppConfig, DiscordConfig, TwitchConfig, TelegramConfig, NotificationConfig };