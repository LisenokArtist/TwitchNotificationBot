const { MessageModel } = require('./MessageModel');

const ReactForRoleMessageModel = class ReactForRoleMessageModel extends MessageModel {
    /**
     * @param {String} guildId ������������� �������
     * @param {String} messageId ������������� ���������
     * @param {String} reaction ������� ���� ":reaction:"
     * @param {String} roleId ����
     */
    constructor(guildId, messageId, reaction, roleId) {
        super(guildId, messageId);
        /** @type {String} */
        this.reaction = reaction;
        /** @type {String} */
        this.roleId = roleId;
    }
}

module.exports = { ReactForRoleMessageModel }