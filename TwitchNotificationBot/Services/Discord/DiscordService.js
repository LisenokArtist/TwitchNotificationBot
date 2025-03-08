const ServiceBase = require('../ServiceBase');
const { IntentsBitField } = require('../../node_modules/discord.js/src/index');
const Client = require('../../node_modules/discord.js/src/client/Client');
const { GatewayIntentBits } = require('../../node_modules/discord-api-types/v10');
const { Collection } = require('../../node_modules/@discordjs/collection/dist/index');
const path = require('node:path');
const fs = require('node:fs');
const CommandInteraction = require('../../node_modules/discord.js/src/structures/CommandInteraction');
const { REST } = require('../../node_modules/@discordjs/rest/dist/index');
const { Routes } = require('discord.js');
const { DiscordConfig } = require('../../Core/AppConfig');

class DiscordService extends ServiceBase {
    /**
     * 
     * @param {DiscordConfig} config
     */
    constructor(config) {
        super(config.token);
        /** @type {DiscordConfig} */
        this.config = config;

        var bits = new IntentsBitField();
        bits.add(32767);

        this.client = new Client({
            intents: bits,
        });
        

        this.commands = this.#loadCommandCollection();
        this.#registerCommands(this.commands);
        this.#registerEvents();
    }

    /**
     * 
     * @returns @type {Collection}
     */
    #loadCommandCollection() {
        var commands = new Collection();

        const foldersPath = path.join(__dirname, 'Commands');
        const commandFolders = fs.readdirSync(foldersPath);

        for (const folder of commandFolders) {
            const commandsPath = path.join(foldersPath, folder);
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    commands.set(command.data.name, command);
                } else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            }
        }

        return commands;
    }

    /** @param {Collection} commands */
    async #registerCommands(commands) {
        /** @type {REST} */
        const rest = this.client.rest.setToken(this.config.token);
        try {
            console.log(`Started refreshing ${commands.size} application (/) commands.`);
            const data = await rest.put(
                Routes.applicationGuildCommands(this.config.cliendId, this.config.guildId),
                { body: commands.map((v) => { return v.data.toJSON() })},
            );
            console.log(`Successfully reloaded ${data.length} application (/) commands.`);
        } catch (error) {
            console.error(error);
        }
    }

    #registerEvents() {
        this.client.once('error', e => this.#onDefault(e));
        this.client.once('debug', e => this.#onDefault(e));
        this.client.once('ready', () => this.#onReady());

        this.client.on('interactionCreate', i => this.#onInteractionCreate(i))
    }

    /** @param {CommandInteraction} i */
    async #onInteractionCreate(i) {
        if (!i.isChatInputCommand()) return;

        const command = this.commands.get(i.commandName);
        if (!command) { console.log(`No command matching ${interaction.commandName} was found.`); return; }

        try {
            await command.execute(i);
        } catch (e) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
            }
        }
    }

    #onDefault(obj) {
        console.log(obj);
    }

    #onReady() {
        console.log('Is on ready');
    }

    async Start() {
        try {
            if (this.client.isReady() === false) {
                this.client.login(this.config.token);
                console.log(`Discord bot logged in`);
            }
            else {
                console.log(`Discord bot already logged`);
            }
        } catch (e) {
            console.log(e);
        }
    }
}

module.exports = DiscordService;