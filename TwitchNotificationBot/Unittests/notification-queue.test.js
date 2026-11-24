const assert = require('node:assert/strict');
const { NotificationService, NotificationRespondProvider, NotificationTypeProvider } = require('../services/Notification/NotificationService');

describe('NotificationService queue', function () {
    /** @type {NotificationService | undefined} */
    let service;

    afterEach(() => {
        if (service?.timer) {
            clearTimeout(service.timer);
            service.timer = null;
        }
    });

    it('enqueues start, update and end without sending them', function () {
        service = new NotificationService(
            {
                twitchMonitorChannelNames: ['bob'],
                discordGuildId: '1',
                discordRespondChannelId: '2',
                telegramRespondChannelId: '3',
                telegramRespondThreadId: null,
                messagesStartAnnouncement: ['Стрим начался!'],
                messagesEndAnnouncement: ['Стрим закончился.']
            },
            /** @type {import('../services/Twitch/TwitchService').TwitchService} */ ({}),
            /** @type {import('../services/Discord/DiscordService').DiscordService} */ ({}),
            /** @type {import('../services/Telegram/TelegramService').TelegramService} */ ({})
        );
        service.retryInSeconds = 60;
        const live = stream();

        service.onStreamStarted([live]);
        service.onStreamUpdated([live]);
        service.onStreamEnded([live]);

        assert.equal(service.queue.length, 6);
        assert.deepEqual(drain(service).map(item => `${item.respondTo}:${item.type}`), [
            `${NotificationRespondProvider.ToDiscord}:${NotificationTypeProvider.Started}`,
            `${NotificationRespondProvider.ToTelegram}:${NotificationTypeProvider.Started}`,
            `${NotificationRespondProvider.ToDiscord}:${NotificationTypeProvider.Updated}`,
            `${NotificationRespondProvider.ToTelegram}:${NotificationTypeProvider.Updated}`,
            `${NotificationRespondProvider.ToDiscord}:${NotificationTypeProvider.Ended}`,
            `${NotificationRespondProvider.ToTelegram}:${NotificationTypeProvider.Ended}`
        ]);
    });
});

/**
 * @returns {{ user_login: string, user_name: string, title: string, game_name: string, thumbnail_url: string }}
 */
function stream() {
    return {
        user_login: 'bob',
        user_name: 'Bob',
        title: 'Hello',
        game_name: 'Chess',
        thumbnail_url: ''
    };
}

/**
 * @param {NotificationService} service
 * @returns {import('../services/Notification/NotificationService').NotificationRespond[]}
 */
function drain(service) {
    /** @type {import('../services/Notification/NotificationService').NotificationRespond[]} */
    const items = [];
    while (service.queue.length > 0) {
        const item = service.queue.dequeue();
        if (item) {
            items.push(item);
        }
    }
    return items;
}
