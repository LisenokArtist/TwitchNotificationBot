const { DiscordService } = require('./Services/Discord/DiscordService');
const { AppConfig, DiscordConfig } = require('./Core/AppConfig');
const { ServiceBase } = require('./Services/ServiceBase');

class TwitchNotificationBot {
    /**
     * @param {AppConfig} config
     */
    constructor(config) {
        /** @type {ServiceBase[]} */
        this.services = [new DiscordService(config.discordConfig)];

        /** @type {Boolean} */
        this.isRunning = false;
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