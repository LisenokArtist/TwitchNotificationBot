const { SlashCommandBuilder } = require('../node_modules/@discordjs/builders/dist/index');
const BaseClient = require('../node_modules/discord.js/src/client/BaseClient');
const InteractionCommand = class InteractionCommand {
    /**
     * Создает компонент команды
     * @param {SlashCommandBuilder} commandBuilder Конструктор построения команды
     * @param {Function} executeMethod Метод действия для команды
     * @param {Function | null} onCommandAdded Метод, вызываемый при добавлении команды
     */
    constructor(commandBuilder, executeMethod, onCommandAdded) {
        /** @type {SlashCommandBuilder} */
        this.data = commandBuilder;
        /** @type {Function} */
        this.execute = executeMethod ?? this.execute(interaction);
        /** @type {Function | null} */
        this.onAdded = onCommandAdded ?? null;
    }

    /**
     * 
     * @param {CommandInteraction} interaction
     * @param {BaseClient} client
     */
    async execute(interaction, client = null) {
        throw new Error("Not implement function exception");
    }

    validate() {
        if (this.data != null && this.execute != null) {
            return true;
        }
        return false;
    }
}

module.exports = { InteractionCommand };