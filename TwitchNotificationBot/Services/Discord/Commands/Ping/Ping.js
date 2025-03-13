const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index');
const { InteractionCommand } = require('../../../../Core/InteractionCommand');
const CommandInteraction = require('../../../../node_modules/discord.js/src/structures/CommandInteraction');

const PingCommand = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    /** @param {CommandInteraction} interaction */
    async function(interaction) {
        await interaction.reply('Pong!');
    },
    null
)

module.exports = { PingCommand }