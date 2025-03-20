const { EventEmitter } = require('node:events');
//const { TwitchService } = require('./TwitchService');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels')

const StreamMonitorManager = class StreamMonitorManager extends EventEmitter {
    /**
     * �������������� ����� ��������� �������, ������� ����������� �� ������
     * @param {any} twitchService �������� ������, �������� ����������� ��������
     * @param {Number} checkIntervalInSeconds ��� ����� ����� ���������� ����� �������� ������� � ��������
     */
    constructor(twitchService, checkIntervalInSeconds) {
        super();

        /** @type { any } */
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

        /** @type {StreamResponse[]}*/
        const result = await this.twitchService.getStreams(this.monitoredChannels);

        this.monitoredChannels.forEach(user_login => {
            var stream = result.find(
                /** @param {StreamResponse} e */
                e => e.user_login == user_login);

            if (stream) {
                this.#liveStreamUpdated(user_login, stream);
            } else {
                this.#liveStreamEnded(user_login);
            }
        })
    }

    /**
     * ��������� ��� ��������� ������ � ������ � ���
     * @param {String} user_login
     * @param {StreamResponse} stream
     */
    #liveStreamUpdated(user_login, stream) {
        const cachedStream = this.liveStreams.find(
            /** @param {StreamResponse} e */
            e => e.user_login === user_login);
        
        if (cachedStream) {
            const index = this.liveStreams.indexOf(cachedStream);
            this.liveStreams[index] = stream;
            this.emit(StreamMonitorEventProvider.OnStreamUpdated,
                new OnStreamEventArgs(
                    user_login,
                    this.liveStreams[index],
                    `Stream of ${stream.user_name} is updated`));
        } else {
            this.liveStreams.push(stream);
            this.emit(StreamMonitorEventProvider.OnStreamStarted,
                new OnStreamEventArgs(
                    user_login,
                    stream,
                    `Stream of ${stream.user_name} is now live`));
        }
    }

    /**
     * ������� ������ � ������ �� ����
     * @param {String} user_login
     */
    #liveStreamEnded(user_login) {
        var cachedStream = this.liveStreams.find(
            /** @param {StreamResponse} e */
            e => e.user_login == user_login);

        if (!cachedStream) return;

        const index = this.liveStreams.indexOf(cachedStream);
        this.liveStreams = this.liveStreams.slice(index, 1);
        this.emit(StreamMonitorEventProvider.OnStreamEnded,
            new OnStreamEventArgs(
                user_login,
                cachedStream,
                `Stream of ${cachedStream.user_name} is now offline`));
    }
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