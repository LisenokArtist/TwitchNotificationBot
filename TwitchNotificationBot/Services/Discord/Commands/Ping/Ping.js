//const { SlashCommandBuilder } = require('../../../node_modules/@discordjs/builders/dist/index');
const { SlashCommandBuilder } = require('discord.js');
module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!'),

	/**  @param {CommandInteraction} interaction */
	async execute(interaction) {
		await interaction.reply('Pong!');
	},
};