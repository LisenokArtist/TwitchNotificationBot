//const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index')
//module.exports = {
//    data: new SlashCommandBuilder()
//        .setName('give-role-on-react')
//		.setDescription('Give roles on reaction')
//		.addStringOption(o => o.setName('message-id').setDescription('Message id').setRequired(true))
//		.addStringOption(o => o.setName('reaction').setDescription(':reaction:').setRequired(true))
//		.addRoleOption(r => r.setName('role').setDescription('Role').setRequired(true)),
//	/**  @param {CommandInteraction} interaction */
//	async execute(interaction) {
//		await interaction.reply('Pong!');
//	}
//}

const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index');
const { InteractionCommand } = require('../../../../Core/InteractionCommand');
const { GiveRoleOnReactionSettings } = require('../../CommandSettings/GiveRoleOnReaction/give-role-on-reaction-settings');
const CommandInteraction = require('../../../../node_modules/discord.js/src/structures/CommandInteraction');
const { MessageFlags } = require('../../../../node_modules/discord-api-types/v10');
const CommandInteractionOptionResolver = require('../../../../node_modules/discord.js/src/structures/CommandInteractionOptionResolver');
const { Role } = require('../../../../node_modules/discord.js/src/structures/Role');
const { ReactForRoleMessageModel } = require('../../../../Core/Models/ReactForRoleMessageModel');

const GiveRoleOnReactionCommand = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('give-role-on-reaction')
        .setDescription('Gives role when user react on message')
        .addStringOption(o => o.setName('message-id').setDescription('Message id').setRequired(true))
        .addStringOption(o => o.setName('reaction').setDescription(':reaction:').setRequired(true))
        .addRoleOption(r => r.setName('role').setDescription('@Role').setRequired(true)),
    /**  @param {CommandInteraction} interaction */
    async function (interaction) {
        const settings = new GiveRoleOnReactionSettings();
        /** @type {CommandInteractionOptionResolver}*/
        const options = interaction.options;

        try {
            settings.loadSettings();

            const guildId = interaction.guildId;
            /** @type {String} */
            const messageId = options.getString('message-id', true);
            /** @type {String} */
            const reaction = options.getString('reaction', true);
            /** @type {Role} */
            const role = options.getRole('role', true);

            const item = new ReactForRoleMessageModel(guildId, messageId, reaction, role.id);
            settings.messagesToInteract.push(item);
            
            settings.saveSettings();

            await interaction.reply({
                content: 'Changes saved',
                flags: MessageFlags.Ephemeral
            })
        } catch (e) {
            await interaction.reply({
                content: e,
                flags: MessageFlags.Ephemeral
            });
        }
    },
    null
)

module.exports = { GiveRoleOnReactionCommand }