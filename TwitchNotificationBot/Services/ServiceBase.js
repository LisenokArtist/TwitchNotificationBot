const { EventEmitter } = require('node:events');
const NotImplementException = new Error("Not implement exception");

const ServiceBase = class ServiceBase extends EventEmitter {
    constructor() {
        super();
        // �� �������� ���, ����� ����� ������ ��������� �����������
        this.parent;

        this.isInitializated = false;
    }

    async Init() {
        throw NotImplementException;
    }

    async Start() {
        if (!this.isInitializated) this.Init();
    }

    async Stop() {
        throw NotImplementException;
    }
}

module.exports = { ServiceBase };