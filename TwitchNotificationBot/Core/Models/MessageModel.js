const MessageModel = class MessageModel {
    /**
     * @param {String} guildId ������������� �������
     * @param {String} messageId ������������� ���������
     */
    constructor(guildId, messageId) {
        /** @type {String} */
        this.guildId = guildId;
        /** @type {String} */
        this.messageId = messageId;
    }
}

module.exports = { MessageModel }