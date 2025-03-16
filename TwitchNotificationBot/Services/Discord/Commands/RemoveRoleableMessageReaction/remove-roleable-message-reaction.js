const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index');
const { InteractionCommand } = require('../../../../Core/InteractionCommand');
const CommandInteraction = require('../../../../node_modules/discord.js/src/structures/CommandInteraction');
const { MessageFlags } = require('../../../../node_modules/discord-api-types/v10');
const { GiveRoleOnReactionSettings } = require('../../CommandSettings/GiveRoleOnReaction/GiveRoleOnReactionSettings');
const Client = require('../../../../node_modules/discord.js/src/client/Client');
const MessageReaction = require('../../../../node_modules/discord.js/src/structures/MessageReaction');
const { Message } = require('../../../../node_modules/discord.js/src/structures/Message');
const TextChannel = require('../../../../node_modules/discord.js/src/structures/TextChannel');

const RemoveRoleableMessageReaction = new InteractionCommand(
    new SlashCommandBuilder()
        .setName('remove-roleable-message-reaction')
        .setDescription('Remove reaction from message wich gives role')
        .addStringOption(o => o.setName('message-id').setDescription('Message id').setRequired(true))
        .addStringOption(o => o.setName('reaction').setDescription(':reaction:').setRequired(true)),

    /**
     * @param {CommandInteraction} interaction
     * @param {Client} client
     */
    async function (interaction, client) {
        const flags = MessageFlags.Ephemeral;
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
            /** @type {String} */
            const reaction = options.getString('reaction', true);

            settings.loadSettings();
            const removedMessage = settings.removeMessage(interaction.guildId, messageId, reaction);
            if (removedMessage.length > 0) {
                switch (interaction.channel.constructor) {
                    case TextChannel: {
                        /** @type {TextChannel} */
                        const textChannel = interaction.channel;
                        /** @type {Message} */
                        const textChannelMessage = await textChannel.messages.fetch(messageId);
                        removedMessage.forEach(async m => {
                            /** @type {MessageReaction} */
                            const messageReaction = await textChannelMessage.reactions.resolve(m.reaction);
                            messageReaction.remove();
                        });
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

module.exports = { RemoveRoleableMessageReaction }