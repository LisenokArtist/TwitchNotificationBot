const MessageModel = class MessageModel {
    /**
     * @param {String} guildId Идентификатор сервера
     * @param {String} messageId Идентификатор сообщения
     */
    constructor(guildId, messageId) {
        /** @type {String} */
        this.guildId = guildId;
        /** @type {String} */
        this.messageId = messageId;
    }
}

module.exports = { MessageModel }