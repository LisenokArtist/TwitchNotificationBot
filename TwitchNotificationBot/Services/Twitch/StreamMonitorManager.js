const { EventEmitter } = require('node:events');
const { TwitchService } = require('./TwitchService');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels')

const StreamMonitorManager = class StreamMonitorManager extends EventEmitter {
    /**
     * »нициализирует класс менеджера стримов, который отслеживает их статус
     * @param {TwitchService} twitchService ќсновной модуль, которому принадлежит менеджер
     * @param {Number} checkIntervalInSeconds  ак часто будет вызыватьс€ метод проверки стримов в секундах
     */
    constructor(twitchService, checkIntervalInSeconds) {
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

    /** ќстанавливает таймер проверки отслеживаемых стримов */
    stopTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

    /** «апускает таймер проверки отслеживаемых стримов */
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
     * «адает список каналов к мониторингу по имени
     * @param {String[]} names —писок названий каналов
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

    /** ќчищает список каналов, которые отслеживаютс€ */
    clearChannels() {
        this.monitoredChannels = new Array();

        this.emit(StreamMonitorEventProvider.OnMonitoredChannelsUpdated,
            'Monitored channels is cleared');
    }

    /** —обытие таймера */
    async onTimerCallback() {
        try {
            this.emit(StreamMonitorEventProvider.OnTimerTick, 'On timer tick');
            await this.#updateLiveStreamAsync();
        } catch (e) {
            console.log(`Unable update streams with error: ${e}`);
        }
    }

    /** ѕровер€ет изменени€ отслеживаемых стримов */
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
     * ќбрабатывает коллекцию стримов, попавшие под категорию обновленных
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
                this.liveStreams[index] = stream;
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
     * ќбрабатывает коллекцию стримов, попавшие под категорию завершенных
     * @param {string[]} items
     */
    #liveStreamsEnded(items) {
        /** @type {StreamPair[]} */
        let ended = new Array();

        items.forEach(user_login => {
            const cachedStream = this.liveStreams.find(s => s.user_login === user_login);

            if (!cachedStream) return;

            const index = this.liveStreams.indexOf(cachedStream);
            this.liveStreams = this.liveStreams.slice(index, 1);
            ended.push(new StreamPair(user_login, cachedStream))
        })

        this.#emitStreamsEnded(ended);
    }

    /**
     * —оздает событие о начатых стримах
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
     * —оздает событие о обновленных стримах.
     * ћожете переопределить условие при котором будет создано
     * событие со списком обновленных стримов, например
     * учитывать только обновленное название канала и описание
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
     * —оздает событие о завершенных стримах
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
     * —оздает EventArgs класс дл€ событий изменений статуса стрима
     * @param {String} channel Ќазвание канала
     * @param {StreamResponse} stream ƒанные о стриме
     * @param {String} description ќписание событи€
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