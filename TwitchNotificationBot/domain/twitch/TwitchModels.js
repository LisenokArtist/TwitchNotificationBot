const AuthToken = class AuthToken {
    /**
     * 
     * @param {String} access_token Auth token
     * @param {Number} expires_in Time in minutes
     * @param {String} token_type Token type
     * @param {String} refresh_token Token for refreshing
     */
    constructor(access_token, expires_in, token_type, refresh_token) {
        /** @type {String} */
        this.accessToken = access_token;
        /** @type {String} */
        this.refreshToken = refresh_token;
        /** @type {String} */
        this.tokenType = token_type;
        /** @type {Date} */
        this.expiresDate = new Date(Date.now() + expires_in * 1000);
    }
}

module.exports = { AuthToken }