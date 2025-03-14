const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index');
const { InteractionCommand } = require('../../../../Core/InteractionCommand');
const CommandInteraction = require('../../../../node_modules/discord.js/src/structures/CommandInteraction');
const { MessageFlags } = require('../../../../node_modules/discord-api-types/v10');
const CommandInteractionOptionResolver = require('../../../../node_modules/discord.js/src/structures/CommandInteractionOptionResolver');
const { Role } = require('../../../../node_modules/discord.js/src/structures/Role');
const { GiveRoleOnReactionSettings } = require('../../CommandSettings/GiveRoleOnReaction/give-role-on-reaction-settings');

const GiveRoleOnReactionCommand = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('give-role-on-reaction')
        .setDescription('Gives role when user react on message')
        .addStringOption(o => o.setName('message-id').setDescription('Message id').setRequired(true))
        .addStringOption(o => o.setName('reaction').setDescription(':reaction:').setRequired(true))
        .addRoleOption(r => r.setName('role').setDescription('@Role').setRequired(true)),
    /**  @param {CommandInteraction} interaction */
    async function (interaction) {
        var result = "Undefined exception";
        const settings = new GiveRoleOnReactionSettings();
        /** @type {CommandInteractionOptionResolver}*/
        const options = interaction.options;
        
        try {
            const guildId = interaction.guildId;
            /** @type {String} */
            const messageId = options.getString('message-id', true);
            /** @type {String} */
            const reaction = options.getString('reaction', true);
            /** @type {Role} */
            const role = options.getRole('role', true);

            settings.loadSettings();
            const isAdded = settings.addMessage(guildId, messageId, reaction, role.id);

            if (isAdded === true) {
                settings.saveSettings();
                result = "Changes saved";
            }
            else {
                result = "Current settings already exists";
            }
        } catch (e) {
            result = e;
            console.log(e);
        }

        await interaction.reply({
            content: result,
            flags: MessageFlags.Ephemeral
        });
    },
    null
)

module.exports = { GiveRoleOnReactionCommand }