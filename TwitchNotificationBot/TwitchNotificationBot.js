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
        // Composition root: явные зависимости между сервисами.
        this.twitchService = new TwitchService(config.twitchConfig);
        this.discordService = new DiscordService(config.discordConfig);
        this.telegramService = new TelegramService(config.telegramConfig);

        this.notificationService = new NotificationService(
            config.notificationConfig,
            this.twitchService,
            this.discordService,
            this.telegramService
        );

        // До Start, чтобы первый тик таймера не потерял событие.
        this.twitchService.setStreamObserver(this.notificationService);

        /** @type {ServiceBase[]} */
        this.services = [
            this.twitchService,
            this.discordService,
            this.telegramService,
            this.notificationService
        ];

        /** @type {Boolean} */
        this.isRunning = false;
    }

    async Start() {
        try {
            for (const service of this.services) {
                await service.Start();
            }
            this.isRunning = true;
        } catch (e) {
            console.log(`Unable to start services: ${e}`);
        }
    }

    async Stop() {
        try {
            for (const service of this.services) {
                await service.Stop();
            }
            this.isRunning = false;
        } catch (e) {
            console.log(`Unable to stop services: ${e}`);
        }
    }
}

module.exports = { TwitchNotificationBot };