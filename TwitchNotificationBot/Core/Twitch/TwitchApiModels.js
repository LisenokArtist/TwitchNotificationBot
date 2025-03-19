const TokenResponse = function _TokenResponse() {
    /** @type {String} */
    this.access_token;
    /** @type {String} */
    this.refresh_token;
    /** @type {Number} */
    this.expires_in;
    /** @type {String[]} */
    this.scope;
    /** @type {String} */
    this.token_type;
}

module.exports = { TokenResponse }