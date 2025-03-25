const { EventEmitter } = require('node:events');

const ServiceBase = class ServiceBase extends EventEmitter {
    constructor() {
        super();
        // Не описывай тип, иначе будет ошибка цикличной вложенности
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