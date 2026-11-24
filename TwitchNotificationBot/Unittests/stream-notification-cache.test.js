const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StreamNotificationCache } = require('../services/Notification/StreamNotificationCache');

describe('StreamNotificationCache', function () {
    /** @type {string[]} */
    const files = [];

    afterEach(() => {
        for (const file of files.splice(0)) {
            fs.rmSync(file, { force: true });
            fs.rmSync(`${file}.${process.pid}.tmp`, { force: true });
        }
    });

    it('keeps message ids and the last stream across a new instance', function () {
        const file = tempFile();
        files.push(file);
        const cache = new StreamNotificationCache(file);
        cache.save('Bob', {
            discordMessageId: '555',
            telegramMessageId: 7,
            shownAt: 10,
            discordClosed: false,
            telegramClosed: false,
            stream: /** @type {import('../domain/twitch/TwitchApiModels').StreamResponse} */ ({
                user_login: 'bob',
                user_name: 'Bob',
                title: 'Hello',
                game_name: 'Chess',
                thumbnail_url: 'https://img/preview.jpg'
            })
        });

        const loaded = new StreamNotificationCache(file);
        const stored = loaded.list();
        assert.equal(stored.length, 1);
        assert.equal(stored[0].login, 'bob');
        assert.equal(stored[0].discordMessageId, '555');
        assert.equal(stored[0].telegramMessageId, 7);
        assert.equal(stored[0].shownAt, 10);
        assert.equal(loaded.observation()[0].stream.title, 'Hello');

        loaded.save('bob', { discordClosed: true, discordMessageId: null });
        const partial = new StreamNotificationCache(file).list()[0];
        assert.equal(partial.discordClosed, true);
        assert.equal(partial.discordMessageId, null);
        assert.equal(partial.telegramMessageId, 7);
        assert.equal(partial.stream?.title, 'Hello');

        loaded.remove('bob');
        assert.equal(new StreamNotificationCache(file).list().length, 0);
    });

    it('starts empty when the file is damaged', function () {
        const file = tempFile();
        files.push(file);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, '{');
        const cache = new StreamNotificationCache(file);
        assert.equal(cache.list().length, 0);
    });
});

/**
 * @returns {string}
 */
function tempFile() {
    return path.join(os.tmpdir(), `stream-notifications-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
}
