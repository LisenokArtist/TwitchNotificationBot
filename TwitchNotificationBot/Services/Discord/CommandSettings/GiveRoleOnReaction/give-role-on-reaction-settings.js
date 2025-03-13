const { ReactForRoleMessageModel } = require('../../../../Core/Models/ReactForRoleMessageModel')
const path = require('node:path');
const fs = require('node:fs');
const filePath = path.join(__dirname, 'GiveRoleOnReactionSettings.json');

const GiveRoleOnReactionSettings = class GiveRoleOnReactionSettings {
    constructor() {
        /** @type {ReactForRoleMessageModel[]} */
        this.messagesToInteract = new Array();
    }

    /**
     * Добавляет сообщение в список
     * @param {String} guildId Идентификатор сервера
     * @param {String} messageId Идентификатор сообщения
     * @param {String} reaction Реакция вида ":reaction:"
     * @param {String} roleId Роль
     */
    addMessage(guildId, messageId, reaction, roleId) {
        const item = new ReactForRoleMessageModel(guildId, messageId, reaction, roleId);
        this.messagesToInteract.push(item);
    }

    /**
     * Удаляет отслеживаемое сообщение по его идентификатору
     * @param {any} messageId Идентификатор сообщения
     * @returns
     */
    removeMessageById(messageId) {
        var result = null;

        const index = this.messagesToInteract.findIndex(x => {
            return x.messageId === messageId
        });

        if (index > -1) {
            result = this.messagesToInteract[index];
            this.messagesToInteract.slice(index, 1);
        }

        return result;
    }

    loadSettings() {
        const file = fs.readFileSync(filePath, 'utf8');
        try {
            const result = JSON.parse(file);
            Object.assign(this, result);
        } catch (e) {
            console.log(e);
            //throw new Error("Not implement load settings exception");
        }
    }

    saveSettings() {
        const json = JSON.stringify(this);
        try {
            fs.writeFileSync(filePath, json);
        } catch (e) {
            console.log(e);
            //throw new Error("Not implement save settings exception");
        }
        
    }
    
}

module.exports = { GiveRoleOnReactionSettings }