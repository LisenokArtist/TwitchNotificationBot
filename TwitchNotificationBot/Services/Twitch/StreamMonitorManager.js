const { EventEmitter } = require('node:events');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels')
/** @typedef {import('./TwitchService').TwitchService} TwitchService */

const StreamMonitorManager = class StreamMonitorManager extends EventEmitter {
    /**
     * �������������� ����� ��������� �������, ������� ����������� �� ������
     * @param {TwitchService} twitchService �������� ������, �������� ����������� ��������
     * @param {Number} checkIntervalInSeconds ��� ����� ����� ���������� ����� �������� ������� � ��������
     */
    constructor(checkIntervalInSeconds, twitchService) {
        super();

        /** @type { TwitchService } */
        this.twitchService = twitchService;
        /** @type { Number } */
        this.checkIntervalInSeconds = checkIntervalInSeconds;

        /** @type { String[] } */
        this.monitoredChannels = [];
        /** @type { StreamResponse[] } */
        this.liveStreams = [];

        this.timerInterval = null;
    }

    /** ������������� ������ �������� ������������� ������� */
    stopTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

    /** ��������� ������ �������� ������������� ������� */
    startTimer() {
        if (!this.timerInterval) {
            this.timerInterval = setInterval(
                async () => {
                    this.onTimerCallback();
                },
                this.checkIntervalInSeconds * 1000);
        }
    }

    /**
     * ������ ������ ������� � ����������� �� �����
     * @param {String[]} names ������ �������� �������
     */
    setChannelsByName(names) {
        if (!names)
            throw new Error('Not argument provided');
        if (names.length == 0)
            throw new Error('Channels not set');

        this.monitoredChannels = names;

        this.emit(StreamMonitorEventProvider.OnMonitoredChannelsUpdated,
            'Monitored channels is updated');
    }

    /** ������� ������ �������, ������� ������������� */
    clearChannels() {
        this.monitoredChannels = new Array();

        this.emit(StreamMonitorEventProvider.OnMonitoredChannelsUpdated,
            'Monitored channels is cleared');
    }

    /** ������� ������� */
    async onTimerCallback() {
        try {
            this.emit(StreamMonitorEventProvider.OnTimerTick, 'On timer tick');
            await this.#updateLiveStreamAsync();
        } catch (e) {
            console.log(`Unable update streams with error: ${e}`);
        }
    }

    /** ��������� ��������� ������������� ������� */
    async #updateLiveStreamAsync() {
        if (this.monitoredChannels.length === 0) return;

        /** @type {StreamPair[]}*/
        let updated = new Array();
        /** @type {string[]}*/
        let ended = new Array();

        /** @type {StreamResponse[]}*/
        const result = await this.twitchService.getStreams(this.monitoredChannels);

        this.monitoredChannels.forEach(user_login => {
            var stream = result.find(
                /** @param {StreamResponse} e */
                e => e.user_login == user_login);

            if (stream) {
                updated.push(new StreamPair(user_login, stream));
            } else {
                ended.push(user_login);
            }
        })

        if (updated.length > 0) {
            this.#liveStreamsUpdated(updated);
        }

        if (ended.length > 0) {
            this.#liveStreamsEnded(ended);
        }
    }

    /**
     * ������������ ��������� �������, �������� ��� ��������� �����������
     * @param {StreamPair[]} items
     */
    #liveStreamsUpdated(items) {
        /** @type {StreamPair[]} */
        let started = new Array();
        /** @type {StreamPair[]} */
        let updated = new Array();

        items.forEach(i => {
            /** */
            const cachedStream = this.liveStreams.find(s => s.user_login === i.user_login);

            if (cachedStream) {
                const index = this.liveStreams.indexOf(cachedStream);
                this.liveStreams[index] = i.stream;
                updated.push(i);
            } else {
                this.liveStreams.push(i.stream);
                started.push(i);
            }
        })

        this.#emitStreamsStarted(started);
        this.#emitStreamsUpdated(updated);
    }

    /**
     * ������������ ��������� �������, �������� ��� ��������� �����������
     * @param {string[]} items
     */
    #liveStreamsEnded(items) {
        /** @type {StreamPair[]} */
        let ended = new Array();

        items.forEach(user_login => {
            const cachedStream = this.liveStreams.find(s => s.user_login === user_login);

            if (!cachedStream) return;

            const index = this.liveStreams.indexOf(cachedStream);
            this.liveStreams.splice(index, 1);
            ended.push(new StreamPair(user_login, cachedStream))
        })

        this.#emitStreamsEnded(ended);
    }

    /**
     * ������� ������� � ������� �������
     * @param {StreamPair[]} streams
     */
    #emitStreamsStarted(streams) {
        if (streams.length > 0) {
            this.emit(StreamMonitorEventProvider.OnStreamStarted,
                streams.map(s => new OnStreamEventArgs(
                    s.user_login,
                    s.stream,
                    `Stream of ${s.stream.user_name} is now live`)));
        }
    }

    /**
     * ������� ������� � ����������� �������.
     * ������ �������������� ������� ��� ������� ����� �������
     * ������� �� ������� ����������� �������, ��������
     * ��������� ������ ����������� �������� ������ � ��������
     * @param {StreamPair[]} streams
     */
    #emitStreamsUpdated(streams) {
        if (streams.length > 0) {
            this.emit(StreamMonitorEventProvider.OnStreamUpdated,
                streams.map(s => new OnStreamEventArgs(
                    s.user_login,
                    s.stream,
                    `Stream of ${s.stream.user_name} is updated`)));
        }
    }

    /**
     * ������� ������� � ����������� �������
     * @param {StreamPair[]} streams
     */
    #emitStreamsEnded(streams) {
        if (streams.length > 0) {
            this.emit(StreamMonitorEventProvider.OnStreamEnded,
                streams.map(s => new OnStreamEventArgs(
                    s.user_login,
                    s.stream,
                    `Stream of ${s.stream.user_name} is now offline`)))
        }
    }
}

const StreamPair = function StreamPair(user_login, stream) {
    /** @type {string} */
    this.user_login = user_login;
    /** @type {StreamResponse} */
    this.stream = stream;
}

const OnStreamEventArgs = class OnStreamEventArgs {
    /**
     * ������� EventArgs ����� ��� ������� ��������� ������� ������
     * @param {String} channel �������� ������
     * @param {StreamResponse} stream ������ � ������
     * @param {String} description �������� �������
     */
    constructor(channel, stream, description = '') {
        /** @type {String} */
        this.channel = channel;
        /** @type {StreamResponse}*/
        this.stream = stream;
        /** @type {String} */
        this.description = description;
    }
}

const StreamMonitorEventProvider = {
    OnMonitoredChannelsUpdated: 'onChannelsSet',
    OnTimerTick: 'onTimerTick',
    OnStreamStarted: 'onStreamStarted',
    OnStreamUpdated: 'onStreamUpdated',
    OnStreamEnded: 'onStreamEnded'
}

module.exports = { StreamMonitorManager, OnStreamEventArgs, StreamMonitorEventProvider }