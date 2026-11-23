const fs = require('node:fs');
const path = require('node:path');
const { twitchAuthTokenFile, migrateLegacyFiles } = require('../../config/AppPaths');
const filePath = twitchAuthTokenFile;
const { TwitchConfig } = require('../../config/AppConfig');
const { ServiceBase } = require('../ServiceBase');
const { AuthToken } = require('../../domain/twitch/TwitchModels');
const { TokenResponse, StreamsResponse, StreamResponse } = require('../../domain/twitch/TwitchApiModels');
const { StreamMonitorManager } = require('./StreamMonitorManager');
/** @typedef {import('../../ports/StreamObserver').StreamObserver} StreamObserver */
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

        this.streamMonitorManager = new StreamMonitorManager(60, this);
    }

    /**
     * 
     * @param {String[]} channels 
     */
    setChannelsByName(channels) {
        if (channels.length > 20) throw new Error('More then 20 values not supported');
        this.streamMonitorManager.setChannelsByName(channels);
    }

    /**
     * Подписывает наблюдателя на события мониторинга стримов.
     * @param {StreamObserver | null} observer
     */
    setStreamObserver(observer) {
        this.streamMonitorManager.setObserver(observer);
    }

    /**
     * ��������� ����� � ����
     * @returns true ���� ���������� ���� �������
     */
    #saveAuthToken() {
        const json = JSON.stringify(this.authToken);
        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, json);
            return true;
        } catch (e) {
            console.log('Unable to save twitch token with error: ' + e);
        }
        return false;
    }

    /**
     * ��������� ����� �� �����
     * @returns true ���� �������� ���� �������
     */
    #loadAuthToken() {
        migrateLegacyFiles();
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
     * �������� ����� ����� �����������
     * @returns {TokenResponse}
     */
    async #getNewTokenAsync() {
        const endPoint = 'https://id.twitch.tv/oauth2/token';
        const options = {
            headers: {
                "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.secretId,
                grant_type: "client_credentials",
                scope: this.scopes?.join(" ")
            })
        }
        const response = await fetch(endPoint, options);
        const result = await response.text();
        try {
            return JSON.parse(result);
        } catch (e) {
            this.#error(e);
            return undefined;
        }
    }

    async getNewTokenAsyncTest() {
        return await this.#getNewTokenAsync();
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
     * ����������� ������
     * @param {String} message ��������� � �������
     */
    #error(message) {
        throw new Error(message);
    }

    /**
     * ��������� get ������
     * @param {any} endpoint
     * @param {any} type
     * @returns {Response}
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

        //��� ��������� ������ �����
        const response = await fetch(url, options);

        switch (response.status) {
            case 401: {
                await this.#refresh();
                return await this.#get(endpoint, base);
            }
        }

        return response;
    }

    /** ��������� ������ ������� */
    async Start() {
        //���������� �������������
        this.isInitializated = true;

        await this.#updateTokenAsync();
        this.streamMonitorManager.startTimer();
    }

    /** ������������� ������ ������� */
    async Stop() {
        this.streamMonitorManager.stopTimer();
    }

    async #updateTokenAsync() {
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
                await getAndSetToken();
            }
            console.log('Token loaded from file');
        } else {
            const isValid = await this.#validate();
            if (!isValid) {
                await getAndSetToken();
            }
        }
    }

    /**
     * �������� ������
     * @param { String[] } userLogins
     * @returns { StreamResponse[] | null }
     */
    async getStreams(userLogins) {
        const endPoint = '/streams';

        const query = (!userLogins) ? '' : `?${userLogins.map(x => `user_login=${x}`).join('&')}`;
        try {
            const response = await this.#get(endPoint + query);
            /** @type { StreamsResponse } */
            const result = await response.json();
            return result.data;
        } catch (e) {

        } 
        return null;
    }

    /** ��� ����-������ */
    async TestUpdateTokenAsync() {
        return await this.#updateTokenAsync();
    }
}

module.exports = { TwitchService };