const { AppConfig } = require('./config/AppConfig');
const { streamNotificationsFile } = require('./config/AppPaths');
const { ServiceBase } = require('./services/ServiceBase');
const { TwitchService } = require('./services/Twitch/TwitchService');
const { DiscordService } = require('./services/Discord/DiscordService');
const { TelegramService } = require('./services/Telegram/TelegramService');
const { NotificationService } = require('./services/Notification/NotificationService');
const { StreamNotificationCache } = require('./services/Notification/StreamNotificationCache');

class TwitchNotificationBot {
    /**
     * @param {AppConfig} config
     */
    constructor(config) {
        // Composition root: явные зависимости между сервисами.
        const streamNotifications = new StreamNotificationCache(streamNotificationsFile);
        this.twitchService = new TwitchService(config.twitchConfig, streamNotifications);
        this.discordService = new DiscordService(config.discordConfig);
        this.telegramService = new TelegramService(config.telegramConfig);

        this.notificationService = new NotificationService(
            config.notificationConfig,
            this.twitchService,
            this.discordService,
            this.telegramService,
            streamNotifications
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