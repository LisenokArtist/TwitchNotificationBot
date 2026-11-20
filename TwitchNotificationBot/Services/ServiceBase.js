const { EventEmitter } = require('node:events');
//const { TwitchNotificationBot } = require('../TwitchNotificationBot');
const NotImplementException = new Error("Not implement exception");

const ServiceBase = class ServiceBase extends EventEmitter {
    constructor() {
        super();
        // �� �������� ���, ����� ����� ������ ��������� �����������
        this.parent;

        this.isInitializated = false;
    }

    ///** @returns {TwitchNotificationBot|undefined} */
    getParent() {
        return this.parent;
    }

    async Init() {
        throw NotImplementException;
    }

    async Start() {
        if (!this.isInitializated) await this.Init();
    }

    async Stop() {
        throw NotImplementException;
    }
}

module.exports = { ServiceBase };