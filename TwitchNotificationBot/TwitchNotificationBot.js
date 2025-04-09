const { AppConfig } = require('./Core/AppConfig');
const { ServiceBase } = require('./Services/ServiceBase');
const { TwitchService } = require('./Services/Twitch/TwitchService');
const { DiscordService } = require('./Services/Discord/DiscordService');
const { TelegramService } = require('./Services/Telegram/TelegramService');
const { NotificationService } = require('./Services/Notification/NotificationService');

class TwitchNotificationBot {
    /**
     * @param {AppConfig} config
     */
    constructor(config) {
        /** @type {ServiceBase[]} */
        this.services = [
            new TwitchService(config.twitchConfig),
            new DiscordService(config.discordConfig),
            new TelegramService(config.telegramConfig),
            new NotificationService(config.notificationConfig)
        ];

        /** @type {Boolean} */
        this.isRunning = false;

        this.setParentToServices();
    }

    /**
     * Возвращает сервис по имени
     * @param {ServiceBase} instance Класс сервиса
     * @returns {ServiceBase|undefined} Сервис если такой существует или undefined
     */
    getService(instance) {
        return this.services.find(x => x instanceof instance);
    }

    /** @type {TwitchService} */
    get twitchService() {
        return this.getService(TwitchService);
    }
    /** @type {DiscordService} */
    get discordService() {
        return this.getService(DiscordService);
    }
    /** @type {TelegramService} */
    get telegramService() {
        return this.getService(TelegramService);
    }
    /** @type {NotificationService} */
    get notificationService() {
        return this.getService(NotificationService);
    }

    setParentToServices() {
        for (var i in this.services) {
            this.services[i].setParentToServices = this.setParentToServices;
            this.services[i].setParentToServices();
            this.services[i].parent = this;
            delete this.services[i].setParentToServices;
        }
        return this;
    }



    async Start() {
        try {
            this.services.forEach(async x => await x.Start());
            this.isRunning = true;
        } catch (e) {
            console.log(`Unable to start services: ${e}`);
        }
    }

    async Stop() {
        try {
            this.services.forEach(async x => await x.Stop());
            this.isRunning = false;
        } catch (e) {
            console.log(`Unable to stop services: ${e}`);
        }
    }
}

module.exports = { TwitchNotificationBot };