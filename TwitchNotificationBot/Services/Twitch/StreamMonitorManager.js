const { EventEmitter } = require('node:events');
const { TwitchService } = require('./TwitchService');

const StreamMonitorManager = class StreamMonitorManager extends EventEmitter {
    /**
     * 
     * @param {TwitchService} twitchService Основной модуль, которому принадлежит менеджер
     * @param {Number} checkIntervalInSeconds Как часто будет вызываться метод проверки стримов в секундах
     */
    constructor(twitchService, checkIntervalInSeconds) {
        super();

        /** @type { TwitchService } */
        this.twitchService = twitchService;
        /** @type { Number } */
        this.checkIntervalInSeconds = checkIntervalInSeconds;

        this.channelsToMonitor = new Array();

        this.timerInterval = null;

        this.#startTimer();
    }

    #stopTimer() {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
    }

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

        this.channelsToMonitor = names;

        this.emit(StreamMonitorEventProvider.OnChannelsSet,
            'StreamMonitor channels is updated');
    }

    async onTimerCallback() {

    }

    async updateStreamersAsync() {
        
    }
}

const StreamMonitorEventProvider = {
    OnChannelsSet: 'onChannelsSet',
    OnStreamStarted: 'onStreamStarted',
    OnStreamEnded: 'onStreamEnded'
}

module.exports = { StreamMonitorManager, StreamMonitorEventProvider }