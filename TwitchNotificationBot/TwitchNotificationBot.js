const { DiscordService } = require('./Services/Discord/DiscordService');
const { AppConfig, DiscordConfig } = require('./Core/AppConfig');
const { ServiceBase } = require('./Services/ServiceBase');
const { TwitchService } = require('./Services/Twitch/TwitchService');
const { TelegramService } = require('./Services/Telegram/TelegramService');
const { NotificationService } = require('./Services/Notification/NotificationService');


class TwitchNotificationBot {
    /**
     * @param {AppConfig} config
     */
    constructor(config) {
        /** @type {ServiceBase[]} */
        this.services = [
            //new DiscordService(config.discordConfig),
            //new TwitchService(config.twitchConfig),
            //new TelegramService(config.telegramConfig),
            new NotificationService()
        ];

        /** @type {Boolean} */
        this.isRunning = false;
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

module.exports = TwitchNotificationBot;