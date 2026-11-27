const METHODS = ['log', 'info', 'warn', 'error'];

/** @type {boolean} */
let installed = false;

/**
 * Ставит местное время перед каждым сообщением console.
 * Повторный вызов ничего не меняет.
 */
function installLogTimestamps() {
    if (installed) {
        return;
    }

    installed = true;
    for (const method of METHODS) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            original(...prefixLogArgs(formatLogTime(new Date()), args));
        };
    }
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatLogTime(date) {
    const pad = (value) => String(value).padStart(2, '0');
    const offsetMinutes = -date.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absolute = Math.abs(offsetMinutes);
    const offset = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
    return `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offset}]`;
}

/**
 * @param {string} time
 * @param {unknown[]} args
 * @returns {unknown[]}
 */
function prefixLogArgs(time, args) {
    if (typeof args[0] === 'string') {
        return [`${time} ${args[0]}`, ...args.slice(1)];
    }

    return [time, ...args];
}

module.exports = { installLogTimestamps, formatLogTime, prefixLogArgs };
