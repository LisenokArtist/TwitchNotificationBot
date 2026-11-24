/** @typedef {import('../domain/twitch/TwitchApiModels').StreamResponse} StreamResponse */

/**
 * @typedef {object} LiveRecord
 * @property {string} login
 * @property {StreamResponse} stream
 * @property {number} shownAt
 */

/**
 * Кладёт ранее известные эфиры в карты стратегии.
 * Канал вне текущего списка наблюдения пропускается.
 * @param {string[]} logins
 * @param {(() => LiveRecord[]) | undefined} restored
 * @param {Map<string, StreamResponse>} live
 * @param {Map<string, number>} shownAt
 */
function restoreLiveSet(logins, restored, live, shownAt) {
    if (typeof restored !== 'function') {
        return;
    }

    const watched = new Set();
    for (const login of logins) {
        watched.add(login.toLowerCase());
    }

    for (const record of restored()) {
        if (!record || typeof record.login !== 'string' || typeof record.shownAt !== 'number') {
            continue;
        }
        if (!record.stream || typeof record.stream.user_login !== 'string') {
            continue;
        }

        const key = record.login.toLowerCase();
        if (!watched.has(key)) {
            continue;
        }

        live.set(key, record.stream);
        shownAt.set(key, record.shownAt);
    }
}

module.exports = { restoreLiveSet };
