class AppConfig {
    /**
     * ������� ����� � ������������ ����� �������
     * @param {DiscordConfig} discordConfig
     */
    constructor(discordConfig) {
        /** @type {DiscordConfig} */
        this.discordConfig = discordConfig;
    }
}
//

class DiscordConfig {
    /**
     * ������� ����� � ������������ ��� ������ Discord
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
module.exports = { AppConfig, DiscordConfig };