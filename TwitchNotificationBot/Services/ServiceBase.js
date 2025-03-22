const { EventEmitter } = require('node:events');
const { TwitchNotificationBot } = require('../TwitchNotificationBot');

const ServiceBase = class ServiceBase extends EventEmitter {
    constructor() {
        super();
        /** @type {TwitchNotificationBot}*/
        this.parent;
    }

    async Start() {
        throw new Error("Not implement exception");
    }

    async Stop() {
        throw new Error("Not implement exception");
    }
}

module.exports = { ServiceBase };