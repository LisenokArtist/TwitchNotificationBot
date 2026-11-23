const { SlashCommandBuilder } = require('@discordjs/builders');
const { InteractionCommand } = require('../../InteractionCommand');
const { CommandInteraction } = require('discord.js');

const PingCommand = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),
    /**
     * 
     * @param {CommandInteraction} interaction
     * @param {BaseClient} client
     */
    async function (interaction, client) {
        await interaction.reply('Pong!');
    },
    null
)

module.exports = { PingCommand }