const fs = require('node:fs');
const path = require('node:path');
const { envFile, settingsFile, migrateLegacyFiles } = require('./AppPaths');
const { parseTwitchObservation } = require('../twitch/observationSettings');

class AppConfig {
    /**
     * Создает класс с настройками всего решения.
     * Секреты читаются из config/.env, остальные поля из config/settings.json.
     * @param {DiscordConfig} [discordConfig]
     * @param {TwitchConfig} [twitchConfig]
     * @param {TelegramConfig} [telegramConfig]
     * @param {NotificationConfig} [notificationConfig]
     */
    constructor(discordConfig, twitchConfig, telegramConfig, notificationConfig) {
        /** @type {DiscordConfig} */
        this.discordConfig = discordConfig ?? new DiscordConfig();
        /** @type {TwitchConfig} */
        this.twitchConfig = twitchConfig ?? new TwitchConfig();
        /** @type {TelegramConfig} */
        this.telegramConfig = telegramConfig ?? new TelegramConfig();
        /** @type {NotificationConfig} */
        this.notificationConfig = notificationConfig ?? new NotificationConfig();
    }

    /**
     * Сохраняет настройки без секретов.
     * @returns {boolean} true если сохранение было успешно
     */
    save() {
        const settings = {
            discordGuildId: this.discordConfig.guildId || this.notificationConfig.discordGuildId || '',
            twitchMonitorChannelNames: this.notificationConfig.twitchMonitorChannelNames ?? [],
            discordRespondChannelId: this.notificationConfig.discordRespondChannelId ?? '',
            telegramRespondChannelId: this.notificationConfig.telegramRespondChannelId ?? '',
            telegramRespondThreadId: this.notificationConfig.telegramRespondThreadId ?? null,
            messagesStartAnnouncement: this.notificationConfig.messagesStartAnnouncement,
            messagesEndAnnouncement: this.notificationConfig.messagesEndAnnouncement,
            twitchObservation: this.twitchConfig.observation,
            twitchPollIntervalMinutes: this.twitchConfig.pollIntervalMinutes,
            twitchPreviewRefreshMinutes: this.twitchConfig.previewRefreshMinutes
        };

        try {
            fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
            return true;
        } catch (e) {
            console.log('Unable to save app config file with error: ' + e);
        }
        return false;
    }

    /**
     * Загружает config/.env и config/settings.json.
     * @returns {boolean} true если загрузка была успешна
     */
    load() {
        migrateLegacyFiles();

        const envExists = fs.existsSync(envFile);
        const settingsExist = fs.existsSync(settingsFile);
        if (!envExists && !settingsExist) {
            console.log(`Config not found. Copy the examples to ${envFile} and ${settingsFile}`);
            return false;
        }

        /** @type {Record<string, string>} */
        const env = envExists ? readEnv(envFile) : {};
        const settings = settingsExist ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
        const observation = parseTwitchObservation(settings);
        const guildId = optionalId(settings.discordGuildId);

        Object.assign(this, new AppConfig(
            new DiscordConfig(
                env.DISCORD_TOKEN ?? '',
                env.DISCORD_CLIENT_ID ?? '',
                guildId ?? ''
            ),
            new TwitchConfig(
                env.TWITCH_CLIENT_ID ?? '',
                env.TWITCH_CLIENT_SECRET ?? '',
                observation.strategy,
                observation.pollIntervalMinutes,
                observation.previewRefreshMinutes
            ),
            new TelegramConfig(env.TELEGRAM_BOT_TOKEN ?? ''),
            new NotificationConfig(
                settings.twitchMonitorChannelNames,
                guildId ?? '',
                optionalId(settings.discordRespondChannelId) ?? '',
                optionalId(settings.telegramRespondChannelId) ?? '',
                optionalId(settings.telegramRespondThreadId) ?? null,
                settings.messagesStartAnnouncement,
                settings.messagesEndAnnouncement
            )
        ));
        return true;
    }
}

class DiscordConfig {
    /**
     * Создает класс с настройками для модуля Discord.
     * @param {string} [token]
     * @param {string} [clientId]
     * @param {string} [guildId]
     */
    constructor(token = '', clientId = '', guildId = '') {
        /** @type {string} */
        this.token = token;
        /** @type {string} */
        this.clientId = clientId;
        /** @type {string} */
        this.guildId = guildId;
    }
}

class TwitchConfig {
    /**
     * Создает класс с настройками для модуля Twitch.
     * @param {string} [clientId]
     * @param {string} [secretId]
     * @param {'poll'|'websocket'} [observation]
     * @param {number} [pollIntervalMinutes]
     * @param {number} [previewRefreshMinutes]
     */
    constructor(clientId = '', secretId = '', observation = 'poll', pollIntervalMinutes = 10, previewRefreshMinutes = 10) {
        /** @type {string} */
        this.clientId = clientId;
        /** @type {string} */
        this.secretId = secretId;
        /** @type {'poll'|'websocket'} */
        this.observation = observation;
        /** @type {number} */
        this.pollIntervalMinutes = pollIntervalMinutes;
        /** @type {number} */
        this.previewRefreshMinutes = previewRefreshMinutes;
    }
}

class TelegramConfig {
    /**
     * Создает класс с настройками для модуля Telegram.
     * @param {string} [token]
     */
    constructor(token = '') {
        /** @type {string} */
        this.token = token;
    }
}

class NotificationConfig {
    /**
     * @param {string[]} [channels]
     * @param {string} [discordGuildId]
     * @param {string} [discordChannelId]
     * @param {string} [telegramChannelId]
     * @param {string|null|undefined} [telegramThreadId]
     * @param {string[]|undefined} [messagesStartAnnouncement]
     * @param {string[]|undefined} [messagesEndAnnouncement]
     */
    constructor(
        channels,
        discordGuildId,
        discordChannelId,
        telegramChannelId,
        telegramThreadId,
        messagesStartAnnouncement,
        messagesEndAnnouncement) {
        /** @type {string[]} */
        this.twitchMonitorChannelNames = Array.isArray(channels) ? channels : [];
        /** @type {string} */
        this.discordGuildId = discordGuildId ?? '';
        /** @type {string} */
        this.discordRespondChannelId = discordChannelId ?? '';
        /** @type {string} */
        this.telegramRespondChannelId = telegramChannelId ?? '';
        /** @type {string|null} */
        this.telegramRespondThreadId = telegramThreadId ?? null;

        /** @type {string[]} */
        this.messagesStartAnnouncement = Array.isArray(messagesStartAnnouncement) && messagesStartAnnouncement.length > 0
            ? messagesStartAnnouncement
            : ['Стрим начался!'];
        /** @type {string[]} */
        this.messagesEndAnnouncement = Array.isArray(messagesEndAnnouncement) && messagesEndAnnouncement.length > 0
            ? messagesEndAnnouncement
            : ['Стрим закончился.'];
    }
}

/**
 * @param {string} file
 * @returns {Record<string, string>}
 */
function readEnv(file) {
    /** @type {Record<string, string>} */
    const env = {};
    const text = fs.readFileSync(file, 'utf8');

    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) {
            continue;
        }

        const eq = trimmed.indexOf('=');
        if (eq === -1) {
            continue;
        }

        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        const quoted = value.length >= 2
            && ((value.startsWith('"') && value.endsWith('"'))
                || (value.startsWith("'") && value.endsWith("'")));
        if (quoted) {
            value = value.slice(1, -1);
        }

        env[key] = value;
    }

    return env;
}

/**
 * Оставляет идентификатор строкой: snowflake Discord не помещается в Number.
 * @param {unknown} value
 * @returns {string|undefined}
 */
function optionalId(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    return String(value);
}

module.exports = { AppConfig, DiscordConfig, TwitchConfig, TelegramConfig, NotificationConfig };
