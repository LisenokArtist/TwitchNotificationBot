﻿const { GiveRoleOnReactionSettings } = require('../Services/Discord/CommandSettings/GiveRoleOnReaction/GiveRoleOnReactionSettings');
const { AppConfig, DiscordConfig, TwitchConfig } = require('../Core/AppConfig');
const { TwitchService } = require('../Services/Twitch/TwitchService');


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
    it('GetToken', async function () {
        const config = new AppConfig();
        config.load();
        const service = new TwitchService(config.twitchConfig);
        const result = await service.getNewToken();
        console.log(result);
        return result;
    });
    it('GetStreams', async function () {
        const config = new AppConfig();
        config.load();
        const service = new TwitchService(config.twitchConfig);
        await service.Start();
        const streams = service.getStreams(['cinema2u']);
        console.log(streams);
        return streams;
    });
});

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
})