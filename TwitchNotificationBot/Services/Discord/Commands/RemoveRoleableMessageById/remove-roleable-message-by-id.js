const { SlashCommandBuilder } = require('@discordjs/builders');
const { InteractionCommand } = require('../../InteractionCommand');
const { CommandInteraction, MessageFlags, Client, MessageReaction, Message, TextChannel } = require('discord.js');
const { GiveRoleOnReactionSettings } = require('../../CommandSettings/GiveRoleOnReaction/GiveRoleOnReactionSettings');

const RemoveRoleableMessageById = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('remove-roleable-message-by-id')
        .setDescription('Remove message (from DB) wich gives role')
        .addStringOption(o => o.setName('message-id').setDescription('Message id').setRequired(true)),

    /**
     * @param {CommandInteraction} interaction
     * @param {Client} client
     */
    async function (interaction, client) {
        const flags = MessageFlags.Ephemeral
        await interaction.deferReply({
            flags: flags
        });

        var result = 'Undefined exception';
        const settings = new GiveRoleOnReactionSettings();
        /** @type {CommandInteractionOptionResolver}*/
        const options = interaction.options;

        try {
            /** @type {String} */
            const messageId = options.getString('message-id', true);

            settings.loadSettings();
            const removedMessage = settings.removeMessage(interaction.guildId, messageId);
            if (removedMessage.length > 0) {
                switch (interaction.channel.constructor) {
                    case TextChannel: {
                        /** @type {TextChannel} */
                        const textChannel = interaction.channel;
                        /** @type {Message} */
                        const textChannelMessage = await textChannel.messages.fetch(messageId);
                        await textChannelMessage.reactions.removeAll();
                        break;
                    }
                    default: {
                        throw new Error('Not implement exception');
                        break;
                    }
                }

                settings.saveSettings();
                result = 'Message settings removed';
            } else {
                result = 'Message with id ' + messageId + ' not found';
            }
        } catch (e) {
            result = e;
            console.log(e);
        }

        await interaction.editReply({
            content: result,
            flags: flags
        });
    },

    null
)

module.exports = { RemoveRoleableMessageById }