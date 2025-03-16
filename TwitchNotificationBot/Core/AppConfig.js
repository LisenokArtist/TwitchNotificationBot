const path = require('node:path');
const fs = require('node:fs');
const filePath = path.join(__dirname, 'AppConfig.json');

class AppConfig {
    /**
     * ������� ����� � ������������ ����� �������
     * @param {DiscordConfig} discordConfig
     */
    constructor(discordConfig) {
        /** @type {DiscordConfig} */
        this.discordConfig = discordConfig;
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
            console.log('Unable to read app config file with error: ' + e);
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