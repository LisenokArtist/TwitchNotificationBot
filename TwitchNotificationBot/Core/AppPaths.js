const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');

const envFile = path.join(root, 'config', '.env');
const settingsFile = path.join(root, 'config', 'settings.json');
const twitchAuthTokenFile = path.join(root, 'data', 'twitch-auth-token.json');
const giveRoleSettingsFile = path.join(root, 'data', 'give-role-on-reaction.json');

const legacyAppConfigFile = path.join(__dirname, 'AppConfig.json');
const legacyAuthTokenFile = path.join(root, 'Services', 'Twitch', 'AuthToken.json');
const legacyGiveRoleBesideClass = path.join(
    root,
    'Services',
    'Discord',
    'CommandSettings',
    'GiveRoleOnReaction',
    'GiveRoleOnReactionSettings.json'
);
const legacyGiveRoleAtRoot = path.join(root, 'GiveRoleOnReactionSettings.json');

/**
 * Копирует файл, если новое место ещё пустое.
 * @param {string} from
 * @param {string} to
 */
function copyIfMissing(from, to) {
    if (fs.existsSync(to) || !fs.existsSync(from)) {
        return;
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

/**
 * Переносит старые файлы в config/ и data/, не затирая уже созданные.
 */
function migrateLegacyFiles() {
    copyIfMissing(legacyAuthTokenFile, twitchAuthTokenFile);

    if (!fs.existsSync(giveRoleSettingsFile)) {
        copyIfMissing(legacyGiveRoleBesideClass, giveRoleSettingsFile);
        copyIfMissing(legacyGiveRoleAtRoot, giveRoleSettingsFile);
    }

    if (fs.existsSync(envFile) || fs.existsSync(settingsFile) || !fs.existsSync(legacyAppConfigFile)) {
        return;
    }

    const legacy = JSON.parse(fs.readFileSync(legacyAppConfigFile, 'utf8'));
    const discord = legacy.discordConfig ?? {};
    const twitch = legacy.twitchConfig ?? {};
    const telegram = legacy.telegramConfig ?? {};
    const notification = legacy.notificationConfig ?? {};

    const envText = [
        `DISCORD_TOKEN=${quoteEnv(discord.token)}`,
        `DISCORD_CLIENT_ID=${quoteEnv(discord.clientId)}`,
        `TWITCH_CLIENT_ID=${quoteEnv(twitch.clientId)}`,
        `TWITCH_CLIENT_SECRET=${quoteEnv(twitch.secretId)}`,
        `TELEGRAM_BOT_TOKEN=${quoteEnv(telegram.token)}`,
        ''
    ].join('\n');

    const settings = {
        discordGuildId: notification.discordGuildId ?? discord.guildId ?? '',
        twitchMonitorChannelNames: notification.twitchMonitorChannelNames ?? [],
        discordRespondChannelId: notification.discordRespondChannelId ?? '',
        telegramRespondChannelId: notification.telegramRespondChannelId ?? '',
        telegramRespondThreadId: notification.telegramRespondThreadId ?? null,
        messagesStartAnnouncement: notification.messagesStartAnnouncement ?? [],
        messagesEndAnnouncement: notification.messagesEndAnnouncement ?? []
    };

    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, envText);
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function quoteEnv(value) {
    const text = value == null ? '' : String(value);
    if (/[\s#"'=]/.test(text)) {
        return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    return text;
}

module.exports = {
    envFile,
    settingsFile,
    twitchAuthTokenFile,
    giveRoleSettingsFile,
    migrateLegacyFiles
};
