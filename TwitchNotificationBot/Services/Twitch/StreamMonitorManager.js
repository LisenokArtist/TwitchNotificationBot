const { EventEmitter } = require('node:events');
const { TwitchService } = require('./TwitchService');
const { StreamResponse } = require('../../Core/Twitch/TwitchApiModels')

const StreamMonitorManager = class StreamMonitorManager extends EventEmitter {
    /**
     * Инициализирует класс менеджера стримов, который отслеживает их статус
     * @param {TwitchService} twitchService Основной модуль, которому принадлежит менеджер
     * @param {Number} checkIntervalInSeconds Как часто будет вызываться метод проверки стримов в секундах
     */
    constructor(twitchService, checkIntervalInSeconds) {
        super();

        /** @type { TwitchService } */
        this.twitchService = twitchService;
        /** @type { Number } */
        this.checkIntervalInSeconds = checkIntervalInSeconds;

        /** @type { String[] } */
        this.monitoredChannels = new Array();
        /** @type { StreamResponse[] } */
        this.liveStreams = new Array();

        this.timerInterval = null;
    }

    /** Останавливает таймер проверки отслеживаемых стримов */
    #stopTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

    /** Запускает таймер проверки отслеживаемых стримов */
    #startTimer() {
        if (!this.timerInterval) {
            this.timerInterval = setInterval(
                async () => {
                    this.onTimerCallback();
                },
                this.checkIntervalInSeconds * 1000);
        }
    }

    /**
     * Задает список каналов к мониторингу по имени
     * @param {String[]} names Список названий каналов
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

    /** Очищает список каналов, которые отслеживаются */
    clearChannels() {
        this.monitoredChannels = new Array();

        this.emit(StreamMonitorEventProvider.OnMonitoredChannelsUpdated,
            'Monitored channels is cleared');
    }

    /** Событие таймера */
    async onTimerCallback() {
        try {
            await this.#updateLiveStreamAsync();
        } catch (e) {
            console.log(`Unable update streams with error: ${e}`);
        }
    }

    /** Проверяет изменения отслеживаемых стримов */
    async #updateLiveStreamAsync() {
        if (this.monitoredChannels.length === 0) return;

        const result = await this.twitchService.getStreams(this.monitoredChannels);

        this.monitoredChannels.forEach(channel => {
            var liveStream = result.data.find(
                /** @param {StreamResponse} e */
                e => e.user_login === channel);

            if (liveStream) {
                this.#liveStreamUpdated(channel, liveStream);
            } else {
                this.#liveStreamEnded(channel);
            }
        })
    }

    /**
     * Добавляет или обновляет данные о стриме в кеш
     * @param {String} channel
     * @param {StreamResponse} stream
     */
    #liveStreamUpdated(channel, stream) {
        const streamIndex = this.liveStreams.indexOf(
            /** @param {StreamResponse} e */
            e => e.user_login === channel);

        if (streamIndex > -1) {
            this.liveStreams[streamIndex] = stream;
            this.emit(StreamMonitorEventProvider.OnStreamUpdated,
                new OnStreamEventArgs(
                    channel,
                    cachedStream,
                    `Stream of ${stream.user_name} is updated`));
        } else {
            this.liveStreams.push(stream);
            this.emit(StreamMonitorEventProvider.OnStreamStarted,
                new OnStreamEventArgs(
                    channel,
                    cachedStream,
                    `Stream of ${stream.user_name} is now live`));
        }
    }

    /**
     * Удаляет данные о стриме из кеша
     * @param {String} channel
     */
    #liveStreamEnded(channel) {
        var streamIndex = this.liveStreams.indexOf(
            /** @param {StreamResponse} e */
            e => e.user_login === channel);

        if (streamIndex === -1) return;

        const cachedStream = this.liveStreams[streamIndex];

        this.liveStreams = this.liveStreams.slice(streamIndex, 1);
        this.emit(StreamMonitorEventProvider.OnStreamEnded,
            new OnStreamEventArgs(
                channel,
                cachedStream,
                `Stream of ${cachedStream.user_name} is now offline`));
    }
}

const OnStreamEventArgs = class OnStreamEventArgs {
    /**
     * Создает EventArgs класс для событий изменений статуса стрима
     * @param {String} channel Название канала
     * @param {StreamResponse} stream Данные о стриме
     * @param {String} description Описание события
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
    OnStreamStarted: 'onStreamStarted',
    OnStreamUpdated: 'onStreamUpdated',
    OnStreamEnded: 'onStreamEnded'
}

module.exports = { StreamMonitorManager, OnStreamEventArgs, StreamMonitorEventProvider }