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
     * ������� ������������� ��������� �� ��� ��������������
     * @param {String} messageId ������������� ���������
     * @returns {?ReactForRoleMessageModel} ��������� ������ ��� ������
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

    /**
     * ������� ������������� ��������� �� ��� �������
     * @param {String} reaction �������� ������� ���� :reaction:
     * @returns {?ReactForRoleMessageModel} ��������� ������ ��� ������
     */
    removeMessageByReaction(reaction) {
        var result = null;
        const index = this.messagesToInteract.findIndex(x => {
            return x.reaction === reaction;
        });

        if (index > -1) {
            result = this.messagesToInteract[index];
            this.messagesToInteract.slice(index, 1);
        }

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