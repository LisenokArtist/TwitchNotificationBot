const TokenResponse = function TokenResponse() {
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

const StreamsResponse = function StreamsResponse() {
    /** @type {StreamsResponse[]}*/
    this.data;
    /** @type {PaginationResponse}*/
    this.pagination;
}

const StreamResponse = function StreamResponse() {
    /** @type {Number}*/
    this.id;
    /** @type {Number}*/
    this.user_id;
    /** @type {String}*/
    this.user_login;
    /** @type {String}*/
    this.user_name;
    /** @type {Number}*/
    this.game_id;
    /** @type {String}*/
    this.game_name;
    /** @type {String}*/
    this.type;
    /** @type {String}*/
    this.title;
    /** @type {String[]}*/
    this.tags;
    /** @type {Number}*/
    this.viewer_count;
    /** @type {String}*/
    this.started_at;
    /** @type {String}*/
    this.language;
    /** @type {String}*/
    this.thumbnail_url;
    /** @type {Number[]}*/
    this.tag_ids;
    /** @type {Boolean}*/
    this.is_mature;
}

const PaginationResponse = function PaginationResponse() {
    /** @type {String}*/
    this.cursor;
}

module.exports = {
    TokenResponse,
    StreamsResponse,
    StreamResponse,
    PaginationResponse
}