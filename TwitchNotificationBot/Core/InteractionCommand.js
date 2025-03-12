const { SlashCommandBuilder } = require('../node_modules/@discordjs/builders/dist/index');
//const { Events } = require('../node_modules/discord.js/typings/index');
const { DiscordService } = require('../Services/Discord/DiscordService');
class InteractionCommand {
    /**
     * ������� ��������� �������
     * @param {SlashCommandBuilder} commandBuilder ����������� ���������� �������
     * @param {Function} executeMethod ����� �������� ��� �������
     * @param {Function | null} onCommandAdded �����, ���������� ��� ���������� �������
     */
    constructor(commandBuilder, executeMethod, onCommandAdded) {
        /** @type {SlashCommandBuilder} */
        this.data = commandBuilder;
        /** @type {Function} */
        this.execute = executeMethod ?? this.execute(interaction);
        /** @type {Function | null} */
        this.onAdded = onCommandAdded ?? null;
    }

    /** @param {CommandInteraction} interaction */
    async execute(interaction) {
        throw new Error("Not implement function exception");
    }


    validate() {
        if (this.data != null && this.execute != null) {
            return true;
        }
        return false;
    }
}

module.exports = InteractionCommand;