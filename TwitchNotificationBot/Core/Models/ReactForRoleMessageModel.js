const { MessageModel } = require('./MessageModel');

const ReactForRoleMessageModel = class ReactForRoleMessageModel extends MessageModel {
    /**
     * @param {String} guildId Идентификатор сервера
     * @param {String} messageId Идентификатор сообщения
     * @param {String} reaction Реакция вида ":reaction:"
     * @param {String} roleId Роль
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