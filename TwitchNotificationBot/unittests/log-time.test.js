const assert = require('node:assert/strict');
const { formatLogTime, prefixLogArgs, installLogTimestamps } = require('../logTime');

describe('log time', function () {
    it('puts the local time before the message text', function () {
        const time = formatLogTime(new Date(2026, 10, 27, 11, 6, 5));
        assert.match(time, /^\[2026-11-27 11:06:05 [+-]\d{2}:\d{2}\]$/);
        assert.deepEqual(prefixLogArgs(time, ['Стрим начался', 'ещё']), [`${time} Стрим начался`, 'ещё']);
        assert.deepEqual(prefixLogArgs(time, [new Error('сбой')])[0], time);
    });

    it('prefixes console.log once', function () {
        const saved = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error
        };
        /** @type {unknown[][]} */
        const lines = [];
        console.log = (...args) => {
            lines.push(args);
        };
        try {
            installLogTimestamps();
            console.log('готов');
            console.log('ещё раз');
            assert.equal(lines.length, 2);
            assert.match(String(lines[0][0]), /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}\] готов$/);
            assert.match(String(lines[1][0]), /ещё раз$/);
        } finally {
            console.log = saved.log;
            console.info = saved.info;
            console.warn = saved.warn;
            console.error = saved.error;
        }
    });
});
