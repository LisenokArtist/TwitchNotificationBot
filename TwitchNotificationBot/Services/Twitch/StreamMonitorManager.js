const { StreamResponse } = require('../../domain/twitch/TwitchApiModels')
/** @typedef {import('./TwitchService').TwitchService} TwitchService */
/** @typedef {import('../../ports/StreamObserver').StreamObserver} StreamObserver */

const StreamMonitorManager = class StreamMonitorManager {
    /**
     * �������������� ����� ��������� �������, ������� ����������� �� ������
     * @param {TwitchService} twitchService �������� ������, �������� ����������� ��������
     * @param {Number} checkIntervalInSeconds ��� ����� ����� ���������� ����� �������� ������� � ��������
     */
    constructor(checkIntervalInSeconds, twitchService) {
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

    /** @type {StreamObserver | null} */
    #observer = null;

    /**
     * Назначает наблюдателя событий стрима.
     * Повторный вызов заменяет предыдущего. null отписывает.
     * @param {StreamObserver | null} observer
     */
    setObserver(observer) {
        this.#observer = observer;
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
    }

    /** ������� ������ �������, ������� ������������� */
    clearChannels() {
        this.monitoredChannels = new Array();
    }

    /** ������� ������� */
    async onTimerCallback() {
        try {
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
        this.#notify(streams, observer => observer.onStreamStarted(streams.map(pair => pair.stream)));
    }

    /**
     * ������� ������� � ����������� �������.
     * ������ �������������� ������� ��� ������� ����� �������
     * ������� �� ������� ����������� �������, ��������
     * ��������� ������ ����������� �������� ������ � ��������
     * @param {StreamPair[]} streams
     */
    #emitStreamsUpdated(streams) {
        this.#notify(streams, observer => observer.onStreamUpdated(streams.map(pair => pair.stream)));
    }

    /**
     * ������� ������� � ����������� �������
     * @param {StreamPair[]} streams
     */
    #emitStreamsEnded(streams) {
        this.#notify(streams, observer => observer.onStreamEnded(streams.map(pair => pair.stream)));
    }

    /**
     * Передаёт пары стримов наблюдателю.
     * Пустой список и отсутствие наблюдателя пропускаются.
     * @param {StreamPair[]} pairs
     * @param {(observer: StreamObserver) => void} notify
     */
    #notify(pairs, notify) {
        if (pairs.length === 0) {
            return;
        }

        const observer = this.#observer;
        if (!observer) {
            return;
        }

        notify(observer);
    }
}

const StreamPair = function StreamPair(user_login, stream) {
    /** @type {string} */
    this.user_login = user_login;
    /** @type {StreamResponse} */
    this.stream = stream;
}

module.exports = { StreamMonitorManager }
