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
     * Добавляет сообщение в список если такой записи не существует
     * @param {String} guildId Идентификатор сервера
     * @param {String} messageId Идентификатор сообщения
     * @param {String} reaction Реакция вида ":reaction:"
     * @param {String} roleId Роль
     */
    addMessage(guildId, messageId, reaction, roleId) {
        const item = new ReactForRoleMessageModel(guildId, messageId, reaction, roleId);
        const isExist = this.messagesToInteract.find(x => {
            return x.guildId === item.guildId
                && x.messageId === item.messageId
                && x.reaction === item.reaction
                && x.roleId === item.roleId
        }) != undefined;
        if (!isExist) {
            this.messagesToInteract.push(item);
            return true;
        }
        return false;
    }

    /**
     * Удаляет реакцию у сообщения или все настройки этого сообщения
     * @param {String} guildId ID сервера
     * @param {String} messageId ID сообщения
     * @param {String} reaction Название реакции вида :reaction:
     * @returns {ReactForRoleMessageModel[]} Удаленные записи
     */
    removeMessage(guildId, messageId, reaction = undefined) {
        if (guildId) {
            if (messageId) {
                if (reaction) {
                    return this.#removeMessageByIdAndReaction(guildId, messageId, reaction);
                }
                return this.#removeMessageById(guildId, messageId);
            }
        }
    }

    #removeMessageById(guildId, messageId) {
        var result = new Array();
        this.messagesToInteract = this.messagesToInteract.filter((e) => {
            if (e.guildId === guildId &&
                e.messageId === messageId) {
                result.push(e);
                return false;
            }
            return true;
        });
        console.log(result.length);
        return result;
    }

    #removeMessageByIdAndReaction(guildId, messageId, reaction) {
        var result = new Array();
        this.messagesToInteract = this.messagesToInteract.filter((e) => {
            if (e.guildId === guildId &&
                e.messageId == messageId &&
                e.reaction == reaction) {
                result.push(e);
                return false;
            }
            return true;
        })
        console.log(result.length);
        return result;
    }

    /**
     * Загружает настройки из файла
     * @returns {Boolean} True если файл был загружен
     */
    loadSettings() {
        const isExist = fs.existsSync(filePath);
        if (isExist) {
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

    /**
     * Сохраняет настройки в файл
     * @returns {Boolean} True если файл был успешно сохранен
     */
    saveSettings() {
        const json = JSON.stringify(this);
        try {
            fs.writeFileSync(filePath, json);
            return true;
        } catch (e) {
            console.log(e);
        }
        return false;
    }
}

module.exports = { GiveRoleOnReactionSettings }