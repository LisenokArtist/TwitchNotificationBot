const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TwitchClient, PollStrategy, WebSocketStrategy, parseTwitchObservation } = require('../twitch');

/**
 * @param {number} status
 * @param {unknown} body
 * @returns {Response}
 */
function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function tokenResponse(token) {
    return jsonResponse(200, {
        access_token: token,
        expires_in: 3600,
        token_type: 'bearer'
    });
}

function tempTokenFile() {
    return path.join(os.tmpdir(), `twitch-token-${process.pid}-${Math.random().toString(16).slice(2)}.json`);
}

/**
 * @param {string} tokenFile
 * @param {(url: string, call: { url: string, method: string, body?: string, authorization: string|null }) => Response} handler
 */
function clientWith(tokenFile, handler) {
    /** @type {{ url: string, method: string, body?: string, authorization: string|null }[]} */
    const calls = [];
    /** @type {import('../twitch/TwitchClient').FetchLike} */
    const fetchImpl = async (url, options = {}) => {
        const headers = new Headers(options.headers);
        const call = {
            url: String(url),
            method: options.method ?? 'GET',
            body: typeof options.body === 'string' ? options.body : undefined,
            authorization: headers.get('authorization')
        };
        calls.push(call);
        return handler(call.url, call);
    };

    const client = new TwitchClient({
        clientId: 'client',
        clientSecret: 'secret',
        tokenFile,
        fetch: fetchImpl
    });
    return { client, calls };
}

/**
 * @returns {Promise<void>}
 */
function settle() {
    return new Promise((resolve) => {
        setImmediate(() => {
            setImmediate(resolve);
        });
    });
}

/**
 * @param {() => boolean} ready
 * @returns {Promise<void>}
 */
async function waitFor(ready) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (ready()) {
            return;
        }
        await settle();
    }

    throw new Error('условие не выполнилось');
}

class FakeSocket {
    /**
     * @param {string} url
     */
    constructor(url) {
        /** @type {string} */
        this.url = url;
        /** @type {boolean} */
        this.closed = false;
        /** @type {Record<string, ((event: { data?: unknown }) => void)[]>} */
        this.listeners = {};
        FakeSocket.latest = this;
    }

    /**
     * @param {string} type
     * @param {(event: { data?: unknown }) => void} listener
     */
    addEventListener(type, listener) {
        const list = this.listeners[type] ?? [];
        list.push(listener);
        this.listeners[type] = list;
    }

    close() {
        this.closed = true;
        for (const listener of this.listeners.close ?? []) {
            listener({});
        }
    }

    /**
     * @param {unknown} message
     */
    receive(message) {
        const data = JSON.stringify(message);
        for (const listener of this.listeners.message ?? []) {
            listener({ data });
        }
    }
}

/** @type {FakeSocket | null} */
FakeSocket.latest = null;

function manualClock() {
    /** @type {(() => Promise<void>) | null} */
    let scheduled = null;
    return {
        clock: {
            /**
             * @param {() => Promise<void>} fn
             */
            every(fn) {
                scheduled = fn;
            },
            stop() {
                scheduled = null;
            }
        },
        /**
         * @returns {Promise<void>}
         */
        tick() {
            if (!scheduled) {
                throw new Error('таймер не запущен');
            }
            return scheduled();
        }
    };
}

/**
 * @param {string} title
 * @param {string} [gameName]
 */
function helixStream(title, gameName = 'Chess') {
    return {
        user_login: 'bob',
        user_name: 'Bob',
        title,
        game_name: gameName,
        thumbnail_url: 'https://img/{width}x{height}.jpg'
    };
}

describe('Twitch client', function () {
    /** @type {string[]} */
    const files = [];

    afterEach(() => {
        for (const file of files.splice(0)) {
            fs.rmSync(file, { force: true });
        }
    });

    it('saves a client-credentials token and reuses it', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        const { client, calls } = clientWith(tokenFile, () => tokenResponse('token-a'));

        assert.equal(await client.getAccessToken(), 'token-a');
        assert.equal(await client.getAccessToken(), 'token-a');
        assert.equal(calls.length, 1);

        const body = JSON.parse(calls[0].body ?? '{}');
        assert.equal(body.grant_type, 'client_credentials');
        assert.equal(body.client_id, 'client');
        assert.equal(Object.hasOwn(body, 'refresh_token'), false);

        const saved = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
        assert.equal(saved.accessToken, 'token-a');
        assert.equal(typeof saved.expiresAt, 'string');
    });

    it('requests a new token after 401 and does not refresh', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        let tokens = 0;
        let streams = 0;
        const { client, calls } = clientWith(tokenFile, (url) => {
            if (url.includes('/oauth2/token')) {
                tokens += 1;
                return tokenResponse(`token-${tokens}`);
            }

            streams += 1;
            if (streams === 1) {
                return jsonResponse(401, { message: 'Invalid OAuth token' });
            }

            return jsonResponse(200, { data: [helixStream('Hello')] });
        });

        const statuses = await client.getStreamStatuses(['bob']);
        assert.equal(statuses[0].isLive, true);
        assert.equal(statuses[0].title, 'Hello');
        assert.equal(statuses[0].gameName, 'Chess');
        assert.equal(statuses[0].thumbnailUrl, 'https://img/{width}x{height}.jpg');
        assert.equal(tokens, 2);

        const tokenBodies = calls
            .filter(call => call.url.includes('/oauth2/token'))
            .map(call => JSON.parse(call.body ?? '{}'));
        assert.equal(tokenBodies.length, 2);
        assert.equal(tokenBodies.every(body => body.grant_type === 'client_credentials'), true);
        assert.equal(calls.some(call => (call.body ?? '').includes('refresh_token')), false);

        const streamCalls = calls.filter(call => call.url.includes('/streams'));
        assert.equal(streamCalls.at(-1)?.authorization, 'Bearer token-2');
    });

    it('returns an offline status when helix data is empty', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        const { client } = clientWith(tokenFile, (url) => {
            if (url.includes('/oauth2/token')) {
                return tokenResponse('token-a');
            }
            return jsonResponse(200, { data: [] });
        });

        const statuses = await client.getStreamStatuses(['bob']);
        assert.equal(statuses.length, 1);
        assert.equal(statuses[0].isLive, false);
        assert.equal(statuses[0].title, '');
        assert.equal(statuses[0].stream, null);
    });

    it('rejects more than 100 logins before calling twitch', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        const { client, calls } = clientWith(tokenFile, () => {
            throw new Error('fetch не должен вызываться');
        });
        const logins = Array.from({ length: 101 }, (_, index) => `channel${index}`);

        await assert.rejects(() => client.getStreamStatuses(logins), /100/);
        assert.equal(calls.length, 0);
    });

    it('reuses an existing conduit', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        const { client, calls } = clientWith(tokenFile, (url, call) => {
            if (url.includes('/oauth2/token')) {
                return tokenResponse('token-a');
            }
            assert.equal(call.method, 'GET');
            return jsonResponse(200, { data: [{ id: 'existing', shard_count: 1 }] });
        });

        assert.equal(await client.ensureConduit(), 'existing');
        assert.equal(calls.some(call => call.method === 'POST' && call.url.includes('/conduits')), false);
    });
});

describe('Twitch observation', function () {
    /** @type {string[]} */
    const files = [];
    /** @type {import('../twitch').WebSocketStrategy | null} */
    let socketStrategy = null;

    afterEach(async () => {
        if (socketStrategy) {
            await socketStrategy.stop();
            socketStrategy = null;
        }
        FakeSocket.latest = null;
        for (const file of files.splice(0)) {
            fs.rmSync(file, { force: true });
        }
    });

    it('rejects an interval below one minute and unknown strategies', function () {
        assert.throws(() => parseTwitchObservation({ twitchPollIntervalMinutes: 0 }), /не меньше 1/);
        assert.throws(() => parseTwitchObservation({ twitchPollIntervalMinutes: 0.5 }), /не меньше 1/);
        assert.throws(() => parseTwitchObservation({ twitchPollIntervalMinutes: '1' }), /не меньше 1/);
        assert.throws(() => parseTwitchObservation({ twitchObservation: 'webhook' }), /poll или websocket/);
        assert.deepEqual(parseTwitchObservation({}), {
            strategy: 'poll',
            pollIntervalMinutes: 1
        });
        assert.deepEqual(parseTwitchObservation({ twitchPollIntervalMinutes: 2 }), {
            strategy: 'poll',
            pollIntervalMinutes: 2
        });
        assert.deepEqual(parseTwitchObservation({
            twitchObservation: 'websocket',
            twitchPollIntervalMinutes: 10
        }), {
            strategy: 'websocket',
            pollIntervalMinutes: 10
        });

        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        const { client } = clientWith(tokenFile, () => tokenResponse('token-a'));
        assert.throws(() => new PollStrategy(client, 0.5), /не меньше 1/);
        assert.doesNotThrow(() => new PollStrategy(client, 2, { every() {}, stop() {} }));
    });

    it('reports start, update and end, and keeps the previous stream when helix fails', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        /** @type {Record<string, unknown>[]} */
        const pages = [
            { data: [helixStream('Hello')] },
            { status: 500, message: 'unavailable' },
            { data: [helixStream('Next')] },
            { data: [] }
        ];
        const { client } = clientWith(tokenFile, (url) => {
            if (url.includes('/oauth2/token')) {
                return tokenResponse('token-a');
            }

            const page = pages.shift();
            if (page && page.status === 500) {
                return jsonResponse(500, { message: page.message });
            }
            return jsonResponse(200, page ?? { data: [] });
        });
        const clock = manualClock();
        const strategy = new PollStrategy(client, 1, clock.clock);
        /** @type {string[]} */
        const events = [];
        const observer = {
            /**
             * @param {{ title?: string }[]} streams
             */
            onStreamStarted(streams) {
                events.push(`started:${streams[0].title}`);
            },
            /**
             * @param {{ title?: string }[]} streams
             */
            onStreamUpdated(streams) {
                events.push(`updated:${streams[0].title}`);
            },
            /**
             * @param {{ title?: string }[]} streams
             */
            onStreamEnded(streams) {
                events.push(`ended:${streams[0].title}`);
            }
        };

        await strategy.start(['bob'], observer);
        await clock.tick();
        await clock.tick();
        await clock.tick();
        await strategy.stop();

        assert.deepEqual(events, [
            'started:Hello',
            'updated:Next',
            'ended:Next'
        ]);
    });

    it('receives stream events through a conduit websocket', async function () {
        const tokenFile = tempTokenFile();
        files.push(tokenFile);
        let streamReads = 0;
        const { client, calls } = clientWith(tokenFile, (url, call) => {
            if (url.includes('/oauth2/token')) {
                return tokenResponse('token-a');
            }
            if (url.includes('/users')) {
                return jsonResponse(200, { data: [{ id: '42', login: 'bob', display_name: 'Bob' }] });
            }
            if (url.includes('/streams')) {
                streamReads += 1;
                return jsonResponse(200, { data: [helixStream('Hello')] });
            }
            if (url.includes('/conduits/shards')) {
                return jsonResponse(200, { data: [{ id: '0', status: 'enabled' }] });
            }
            if (url.includes('/conduits') && call.method === 'GET') {
                return jsonResponse(200, { data: [] });
            }
            if (url.includes('/conduits') && call.method === 'POST') {
                return jsonResponse(200, { data: [{ id: 'conduit-1', shard_count: 1 }] });
            }
            if (url.includes('/subscriptions')) {
                const body = JSON.parse(call.body ?? '{}');
                if (body.type === 'channel.update') {
                    return jsonResponse(409, { message: 'subscription exists' });
                }
                return jsonResponse(202, { data: [{ id: 'sub' }] });
            }
            return jsonResponse(500, { message: url });
        });

        const observer = {
            /** @type {{ title: string, user_login: string }[][]} */
            started: [],
            /** @type {{ title: string }[][]} */
            updated: [],
            /** @type {{ title: string }[][]} */
            ended: [],
            /**
             * @param {{ title: string, user_login: string }[]} streams
             */
            onStreamStarted(streams) {
                this.started.push(streams);
            },
            /**
             * @param {{ title: string }[]} streams
             */
            onStreamUpdated(streams) {
                this.updated.push(streams);
            },
            /**
             * @param {{ title: string }[]} streams
             */
            onStreamEnded(streams) {
                this.ended.push(streams);
            }
        };

        const strategy = new WebSocketStrategy(client, {
            WebSocket: FakeSocket,
            url: 'wss://example/ws'
        });
        socketStrategy = strategy;
        const starting = strategy.start(['bob'], observer);
        await waitFor(() => FakeSocket.latest !== null);
        const socket = FakeSocket.latest;
        assert.ok(socket);
        socket.receive({
            metadata: { message_type: 'session_welcome' },
            payload: { session: { id: 'sess-1', keepalive_timeout_seconds: 30 } }
        });
        await starting;

        const shard = calls.find(call => call.url.includes('/conduits/shards'));
        const shardBody = JSON.parse(shard?.body ?? '{}');
        assert.equal(shardBody.shards[0].transport.method, 'websocket');
        assert.equal(shardBody.shards[0].transport.session_id, 'sess-1');

        const subscriptions = calls.filter(call => call.url.includes('/subscriptions'));
        assert.equal(subscriptions.length, 3);
        const types = subscriptions.map(call => JSON.parse(call.body ?? '{}'));
        assert.deepEqual(types.map(body => body.transport), [
            { method: 'conduit', conduit_id: 'conduit-1' },
            { method: 'conduit', conduit_id: 'conduit-1' },
            { method: 'conduit', conduit_id: 'conduit-1' }
        ]);
        assert.equal(calls.some(call => (call.body ?? '').includes('refresh_token')), false);

        socket.receive({
            metadata: { message_type: 'notification', subscription_type: 'stream.online' },
            payload: {
                event: {
                    id: '9001',
                    broadcaster_user_id: '42',
                    broadcaster_user_login: 'bob',
                    broadcaster_user_name: 'Bob',
                    type: 'live',
                    started_at: '2026-01-01T00:00:00Z'
                }
            }
        });
        await waitFor(() => observer.started.length === 1);
        assert.equal(observer.started[0][0].title, 'Hello');
        assert.equal(observer.started[0][0].user_login, 'bob');
        assert.equal(streamReads, 1);

        socket.receive({
            metadata: { message_type: 'notification', subscription_type: 'channel.update' },
            payload: {
                event: {
                    broadcaster_user_login: 'bob',
                    title: 'Next',
                    category_name: 'Just Chatting'
                }
            }
        });
        await waitFor(() => observer.updated.length === 1);
        assert.equal(observer.updated[0][0].title, 'Next');

        socket.receive({
            metadata: { message_type: 'notification', subscription_type: 'stream.offline' },
            payload: { event: { broadcaster_user_login: 'bob', broadcaster_user_name: 'Bob' } }
        });
        await waitFor(() => observer.ended.length === 1);
        assert.equal(observer.ended[0][0].title, 'Next');

        await strategy.stop();
        socketStrategy = null;
        assert.equal(socket.closed, true);
    });
});
