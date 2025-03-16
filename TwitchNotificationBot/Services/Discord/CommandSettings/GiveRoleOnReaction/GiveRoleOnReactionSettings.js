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
     * ��������� ��������� � ������ ���� ����� ������ �� ����������
     * @param {String} guildId ������������� �������
     * @param {String} messageId ������������� ���������
     * @param {String} reaction ������� ���� ":reaction:"
     * @param {String} roleId ����
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
     * ������� ������� � ��������� ��� ��� ��������� ����� ���������
     * @param {String} guildId ID �������
     * @param {String} messageId ID ���������
     * @param {String} reaction �������� ������� ���� :reaction:
     * @returns {ReactForRoleMessageModel[]} ��������� ������
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
     * ��������� ��������� �� �����
     * @returns {Boolean} True ���� ���� ��� ��������
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
     * ��������� ��������� � ����
     * @returns {Boolean} True ���� ���� ��� ������� ��������
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