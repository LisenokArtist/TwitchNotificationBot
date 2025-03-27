const { KeyValuePair } = require('../KeyValuePair');

const PairedQueie = class PairedQueie {
    constructor() {
        this.collection = new Array();
    }

    /**
     * Добавляет элемент в коллекцию
     * @param {KeyValuePair} item
     */
    push(item) {
        if (item.constructor.name != KeyValuePair.constructor.name) {
            throw new Error('Param is not a KeyValuePair element');
        }

        this.collection.push(item);
    }

    /**
     * Находит индекс первого элемента
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     */
    findIndex(predicate) {
        return this.collection.findIndex(predicate);
    }

    /**
     * Извлекает из коллекции первый элемент
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     * @returns {KeyValuePair|undefined}
     */
    shiftBy(predicate) {
        const index = this.collection.findIndex(predicate);
        if (index === -1) return undefined;

        const item = this.collection[index];
        this.collection = this.collection.slice(index, 1);
        return item;
    }
}

module.exports = { PairedQueie }