const assert = require('assert');
const { GiveRoleOnReactionSettings } = require('../Services/Discord/CommandSettings/GiveRoleOnReaction/GiveRoleOnReactionSettings');
const { AppConfig, DiscordConfig } = require('../Core/AppConfig');

describe('Array', function () {
    describe('#indexOf()', function () {
        it('should return -1 when the value is not present', function () {
            const arr = new Array();
            assert.equal([1, 2, 3].indexOf(4), -1);
        });
    });
});

describe('AppConfig', function () {
    it('Generate empty app file config', function () {
        const config = new AppConfig(
            new DiscordConfig('token', 'clientId', 'guildId')
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