const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index');
const InteractionCommand = require('../../../../Core/InteractionCommand');

const PingCommand = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    /** @param {any} interaction */
    async function(interaction) {
        await interaction.reply('Pong!');
    },
    null
)

module.exports = { PingCommand };