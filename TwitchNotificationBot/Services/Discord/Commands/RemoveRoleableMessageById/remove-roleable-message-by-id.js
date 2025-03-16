const { SlashCommandBuilder } = require('../../../../node_modules/@discordjs/builders/dist/index');
const { InteractionCommand } = require('../../../../Core/InteractionCommand');
const CommandInteraction = require('../../../../node_modules/discord.js/src/structures/CommandInteraction');
const { MessageFlags } = require('../../../../node_modules/discord-api-types/v10');
const { GiveRoleOnReactionSettings } = require('../../CommandSettings/GiveRoleOnReaction/GiveRoleOnReactionSettings');
const Client = require('../../../../node_modules/discord.js/src/client/Client');
const MessageReaction = require('../../../../node_modules/discord.js/src/structures/MessageReaction');
const { Message } = require('../../../../node_modules/discord.js/src/structures/Message');

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
            const removedMessage = settings.removeMessageById(messageId);

            if (removedMessage) {
                const constr = interaction.channel.constructor;
                switch (constr) {
                    case TextChannel: {
                        /** @type {TextChannel} */
                        const textChannel = interaction.channel;
                        /** @type {Message} */
                        const textChannelMessage = await textChannel.messages.fetch(messageId);
                        /** @type {MessageReaction} */
                        const textChannelMessageReaction = await textChannelMessage.reactions.resolve(removedMessage.reaction);
                        textChannelMessageReaction.remove();
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

        await interaction.reply({
            content: result,
            flags: flags
        });
    },

    null
)

module.exports = { RemoveRoleableMessageById }