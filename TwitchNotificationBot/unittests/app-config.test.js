const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppConfig, DiscordConfig, TelegramConfig } = require('../config/AppConfig');

const GUILD_ID = '1203097199945195590';
const CHANNEL_ID = '1203097199945195591';

describe('AppConfig', function () {
    /** @type {string[]} */
    const directories = [];

    afterEach(() => {
        for (const directory of directories.splice(0)) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    it('reads env and settings, keeps Discord ids as strings, and saves no secrets', function () {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-config-'));
        directories.push(directory);
        const envPath = path.join(directory, '.env');
        const settingsPath = path.join(directory, 'settings.json');
        const savedPath = path.join(directory, 'saved.json');
        fs.writeFileSync(envPath, [
            '# comment',
            '',
            'DISCORD_TOKEN="secret-token"',
            'DISCORD_CLIENT_ID=client-id',
            'TWITCH_CLIENT_ID=twitch-id',
            'TWITCH_CLIENT_SECRET=secret-client',
            'TELEGRAM_BOT_TOKEN=telegram-token',
            ''
        ].join('\n'));
        fs.writeFileSync(settingsPath, JSON.stringify({
            discordGuildId: GUILD_ID,
            twitchMonitorChannelNames: ['bob'],
            discordRespondChannelId: CHANNEL_ID,
            telegramRespondChannelId: '4242',
            telegramRespondThreadId: '77',
            messagesStartAnnouncement: ['Начался'],
            messagesEndAnnouncement: ['Закончился'],
            twitchObservation: 'poll',
            twitchPollIntervalMinutes: 10,
            twitchPreviewRefreshMinutes: 30
        }));

        const config = new AppConfig();
        assert.equal(config.load({ envFile: envPath, settingsFile: settingsPath }), true);
        assert.equal(config.discordConfig.token, 'secret-token');
        assert.equal(config.discordConfig.clientId, 'client-id');
        assert.equal(config.twitchConfig.secretId, 'secret-client');
        assert.equal(config.telegramConfig.token, 'telegram-token');
        assert.equal(typeof config.discordConfig.guildId, 'string');
        assert.equal(config.discordConfig.guildId, GUILD_ID);
        assert.notEqual(config.discordConfig.guildId, String(Number(GUILD_ID)));
        assert.equal(config.notificationConfig.discordGuildId, GUILD_ID);
        assert.equal(config.notificationConfig.discordRespondChannelId, CHANNEL_ID);
        assert.equal(config.notificationConfig.telegramRespondThreadId, '77');
        assert.deepEqual(config.notificationConfig.twitchMonitorChannelNames, ['bob']);
        assert.equal(config.twitchConfig.observation, 'poll');
        assert.equal(config.twitchConfig.pollIntervalMinutes, 10);
        assert.equal(config.twitchConfig.previewRefreshMinutes, 30);

        assert.equal(config.save(savedPath), true);
        const savedText = fs.readFileSync(savedPath, 'utf8');
        const saved = JSON.parse(savedText);
        assert.equal(saved.discordGuildId, GUILD_ID);
        assert.equal(saved.discordRespondChannelId, CHANNEL_ID);
        assert.equal(savedText.includes('secret-token'), false);
        assert.equal(savedText.includes('secret-client'), false);
        assert.equal(savedText.includes('telegram-token'), false);
        assert.equal(Object.hasOwn(saved, 'token'), false);
        assert.equal(Object.hasOwn(saved, 'clientSecret'), false);
    });

    it('returns false when a config file is missing', function () {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-config-'));
        directories.push(directory);
        const envPath = path.join(directory, '.env');
        const settingsPath = path.join(directory, 'settings.json');
        fs.writeFileSync(envPath, 'DISCORD_TOKEN=secret-token\n');
        fs.writeFileSync(settingsPath, '{}');

        assert.equal(new AppConfig().load({
            envFile: path.join(directory, 'missing.env'),
            settingsFile: path.join(directory, 'missing.json')
        }), false);
        assert.equal(new AppConfig().load({
            envFile: envPath,
            settingsFile: path.join(directory, 'missing.json')
        }), false);
        assert.equal(new AppConfig().load({
            envFile: path.join(directory, 'missing.env'),
            settingsFile: settingsPath
        }), false);
    });

    it('accepts either Discord or Telegram and rejects both empty', function () {
        assert.equal(new AppConfig().hasChatTarget(), false);
        assert.equal(new AppConfig(new DiscordConfig('   ')).hasChatTarget(), false);
        assert.equal(new AppConfig(new DiscordConfig('discord-token')).hasChatTarget(), true);
        assert.equal(new AppConfig(new DiscordConfig(''), undefined, new TelegramConfig('telegram-token')).hasChatTarget(), true);
    });
});
