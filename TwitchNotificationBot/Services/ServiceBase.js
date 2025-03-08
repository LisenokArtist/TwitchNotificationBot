class ServiceBase {
    constructor(token) {
        this.token = token;
    }

    async Start() {
        throw new Error("Not implement exception");
    }

    async Stop() {
        throw new Error("Not implement exception");
    }
}

module.exports = ServiceBase;