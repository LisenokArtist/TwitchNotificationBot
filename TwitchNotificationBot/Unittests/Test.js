const { GiveRoleOnReactionSettings } = require('../Services/Discord/CommandSettings/GiveRoleOnReaction/GiveRoleOnReactionSettings');
const { AppConfig, DiscordConfig, TwitchConfig } = require('../Core/AppConfig');
const { TwitchService } = require('../Services/Twitch/TwitchService');
const { StreamMonitorEventProvider } = require('../Services/Twitch/StreamMonitorManager');
//const { DiscordService } = require('../Services/Discord/DiscordService');
/*const { NotificationService } = require('../Services/Notification/NotificationService');*/
//const { StreamResponse } = require('../Core/Twitch/TwitchApiModels');
const { TwitchNotificationBot } = require('../TwitchNotificationBot');
const { NotificationTypeProvider } = require('../Services/Notification/NotificationService');

describe('AppConfig', function () {
    it('Generate empty app file config', function () {
        const config = new AppConfig(
            new DiscordConfig('token', 'clientId', 'guildId'),
            new TwitchConfig('clientId', 'secretId')
        );
        const result = config.save();
        return result;
    });
    it('Load app file config', function () {
        const config = new AppConfig();
        const result = config.load();
        return result;
    })
})

describe('GiveRoleOnReactionSettings', function () {
    it('Remove by guildId, messageId and return items as result', function () {
        const settings = new GiveRoleOnReactionSettings();
        settings.loadSettings();
        const items = settings.removeMessage('1203097199945195590','1347764616159170570');
        console.log(items.length);
    });
    it('Remove by guildId, messageId, reaction and return items as result', function () {
        const settings = new GiveRoleOnReactionSettings();
        settings.loadSettings();
        const items = settings.removeMessage('1203097199945195590', '1347764616159170570', '❤️');
        console.log(items.length);
    });
});

describe('TwitchService', function () {
    it('GetTokenOrNew', async function () {
        const config = new AppConfig();
        config.load();
        const service = new TwitchService(config.twitchConfig);
        const result = await service.getNewTokenAsyncTest();
        console.log(result);
        return result;
    });
    it('GetStreams', async function () {
        const config = new AppConfig();
        config.load();
        const service = new TwitchService(config.twitchConfig);
        await service.Start();
        const streams = await service.getStreams();
        console.log(streams);
        return streams;
    });
    it('StreamManager', async function () {
        const config = new AppConfig();
        config.load();
        const service = new TwitchService(config.twitchConfig);
        service.streamMonitorManager.timerInterval = 30;
        await service.streamMonitorManager.setChannelsByName('mnemonicman');

        let ticksLeft = 2;

        service.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamUpdated, (e) => {
            console.log(e.description);
        });
        service.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamEnded, (e) => {
            console.log(e.description);
        });
        service.streamMonitorManager.on(StreamMonitorEventProvider.OnStreamStarted, (e) => {
            console.log(e.description);
        });
        service.streamMonitorManager.on(StreamMonitorEventProvider.OnTimerTick, (e) => {
            console.log(e);
            ticksLeft--;
        });

        this.timeout(10 * 1000);
    });
    it('Retry test', async () => {
        const promise = new Promise((resolve, reject) => {
            setTimeout(() => {
                let retry = 3;
                do {
                    console.log('Try complite promise');
                    retry--;

                    if (retry < 1)
                        return resolve('Done');

                    console.log(`Timeout. Retry ${retry}`);

                } while (retry > 0);

                return reject('Non success');
            }, 5000);
        });
        await promise.then(x => console.log(x)).catch(x => console.log(x));
    }).timeout(50000);
});

describe('NotificationService', function () {
    it('Stream started (discord)', async function () {
        const appConfig = new AppConfig();
        appConfig.load();
        const app = new TwitchNotificationBot(appConfig);
        await app.twitchService.Start();
        const streams = await app.twitchService.getStreams();
        const stream = streams[0];
        await app.discordService.Start();
        await app.notificationService.Start();
        await app.notificationService.respondToDiscordAsyncTest(NotificationTypeProvider.Started, stream);
    })
});

describe('Discord', function () {
    it('getRespondChannel', async function () {
        const appConfig = new AppConfig();
        appConfig.load();
        const app = new TwitchNotificationBot(appConfig);
        await app.discordService.Start();
        await app.notificationService.respondToDiscordAsyncTest(NotificationTypeProvider.Started, {
            title: "title",
            url: "https://www.google.ru/",
            thumbnail_url: "https://www.google.ru/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png",
            image: {
                url: "https://www.google.ru/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png"
            },

        });
    })
})

describe('Uncategored', function () {
    it('Date', function () {
        const date = new Date(Date.now() + 5011271 * 1000);
        console.log(date.toUTCString());
        return date;
    });
    it('URLBuilder', () => {
        const users = ['user1', 'user2'];

        const result = users.map(x => `user_login=${x}`).join('&');
        console.log(result);
    });
    it('Streams event triggers', () => {
        const channel = (key, value) => {
            return {
                key: key,
                value: value
            }
        }
        const monitoredChannels = [
            channel(1, "channel1"),
            channel(2, "channel2"),
            channel(3, "channel3"),
            channel(4, "channel4"),
        ];

        var LiveChannels = [
            channel(1, "channel1")
        ]

        let getStreams = [1, 3];

        monitoredChannels.forEach(x => {
            const isLive = getStreams.find(q => q === x.key);
            if (isLive) {
                const isAlreadyLive = LiveChannels.find(l => l.key === x.key);
                if (isAlreadyLive) {
                    console.log(`${x.value} is updated`);
                }
                else {
                    console.log(`${x.value} is live now`);
                }
            }
            else {
                console.log(`${x.value} is now offline`)
            }
        })
    });
    it('String compare', () => {
        const result = 'jmarianne' === 'jmarianne';
        console.log(result);
    });
    it('Nesting parents', () => {
        var myApp = {

            init: function () {
                for (var i in this) {
                    if (typeof this[i] == 'object') {
                        this[i].init = this.init;
                        this[i].init();
                        this[i].parent = this;
                    }
                }
                return this;
            },

            obj1: {
                obj2: {
                    notify: function () {
                        console.log(this.parent.parent.obj3.msg);
                    }
                }
            },

            obj3: {
                msg: 'Hello'
            }

        }.init();

    });
    it('Map', () => {
        const map = new Map();
        return map;
    })
    it('foreach', () => {
        const arr = [0, 1, 2, 3, 4, 5];

        arr.forEach(x => {
            if (x === 3) return;
            console.log(x);
        })
    })
})