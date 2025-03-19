const path = require('node:path');
const fs = require('node:fs');
const filePath = path.join(__dirname, 'AuthToken.json');
const { TwitchConfig } = require('../../Core/AppConfig');
const { ServiceBase } = require('../ServiceBase');
const { AuthToken } = require('../../Core/Twitch/TwitchModels');
const { TokenResponse, StreamsResponse } = require('../../Core/Twitch/TwitchApiModels');
const { StreamMonitorManager } = require('./StreamMonitorManager');
const ingestUrl = "https://ingest.twitch.tv";
const helixUrl = "https://api.twitch.tv/helix";

const TwitchService = class TwitchService extends ServiceBase {
    /**
     * 
     * @param {TwitchConfig} config
     */
    constructor(config) {
        super();

        /** @type {String} */
        this.clientId = config.clientId;
        /** @type {String} */
        this.secretId = config.secretId;
        /** @type {AuthToken} */
        this.authToken;

        this.streamMonitorManager = new StreamMonitorManager(this, 60);
    }

    /**
     * Сохраняет токен в файл
     * @returns true если сохранение было успешно
     */
    #saveAuthToken() {
        const json = JSON.stringify(this.authToken);
        try {
            fs.writeFileSync(filePath, json);
            return true;
        } catch (e) {
            console.log('Unable to save twitch token with error: ' + e);
        }
        return false;
    }

    /**
     * Загружает токен из файла
     * @returns true если загрузка была успешна
     */
    #loadAuthToken() {
        const isExist = fs.existsSync(filePath);
        if (isExist) {
            const file = fs.readFileSync(filePath, 'utf8');
            /** @type {AuthToken} */
            const result = JSON.parse(file);
            this.authToken = result;
            return true;
        }
        return false;
    }


    /**
     * Получает новый токен авторизации
     * @returns {TokenResponse}
     */
    async #getNewTokenAsync() {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.secretId}&grant_type=client_credentials`;
        const response = await fetch(url, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            method: "POST"
        });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        /** @type {TokenResponse}*/
        const result = await response.json();
        return result;
    }

    async #refresh() {
        const isValid = await this.#validate();
        if (isValid) return;

        if (!this.authToken.refreshToken) return this.#error('Refresh token is not set');

        const data = {
            client_id: this.clientId,
            client_secret: this.secretId,
            grant_type: 'refresh_token',
            refresh_token: encodeURIComponent(this.authToken.refreshToken)
        }

        const url = 'https://id.twitch.tv/oauth2/token';
        const options = {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json'
            }
        }

        const response = await fetch(url, options);
        /** @type { TokenResponse } */
        const result = await response.json();

        this.authToken.accessToken = result.access_token || this.authToken.accessToken;
        this.authToken.refreshToken = result.refresh_token || this.authToken.refreshToken;
    }

    async #validate() {
        const url = 'https://id.twitch.tv/oauth2/validate';
        const options = {
            headers: {
                "Authorization": `OAuth ${this.authToken.accessToken}`
            }
        }

        const response = await fetch(url, options);
        const result = await response.json();

        const message = result.message;
        const valid = response.status === 200;

        if (message === "missing authorization token") this._error(message);
        return valid;
    }

    /**
     * Выплевывает ошибку
     * @param {String} message Сообщение с ошибкой
     */
    #error(message) {
        throw new Error(message);
    }

    /**
     * Выполняет get запрос
     * @param {any} endpoint
     * @param {any} type
     * @returns {any}
     */
    async #get(endpoint, base = helixUrl) {
        if (!this.authToken) {
            await this.#getNewTokenAsync();
        }

        const url = base + endpoint;
        const options = {
            method: "GET",
            headers: {
                "Client-ID": this.clientId,
                "Authorization": `Bearer ${this.authToken.accessToken}`
            }
        }

        const response = await fetch(url, options);

        switch (response.status) {
            case 401: {
                await this.#refresh();
                return this.#get(endpoint, base);
            }
        }

        const result = await response.json();
        return result;
    }

    async Start() {
        this.#updateToken();
    }

    async #updateToken() {
        const getAndSetToken = async () => {
            const token = await this.#getNewTokenAsync();
            this.authToken = new AuthToken(
                token.access_token,
                token.expires_in,
                token.token_type,
                token.refresh_token
            );
            console.log('Tok new token');
            this.#saveAuthToken();
        }

        if (!this.authToken) {
            const isLoaded = this.#loadAuthToken();
            if (!isLoaded) {
                getAndSetToken();
            }
            console.log('Token loaded from file');
        } else {
            const isValid = await this.#validate();
            if (!isValid) {
                getAndSetToken();
            }
        }
    }

    /**
     * 
     * @param { String[] } userLogins
     * @returns { StreamsResponse }
     */
    async getStreams(userLogins) {
        const endPoint = '/streams';

        if (!userLogins) {
            return await this.#get(endPoint);
        }

        const query = `?${userLogins.map(x => `user_login=${x}`).join('&') }`;
        /** @type { StreamsResponse } */
        const response = await this.#get(endPoint + query);
        return response;
    }
}



module.exports = { TwitchService };