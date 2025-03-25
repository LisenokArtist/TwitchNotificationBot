const Dictionary = class Dictionary {
    constructor() {
        /** @type {KeyValuePair[]} */
        this.collection = new Array();

    }

    /**
     * Добавляет элемент в коллекцию
     * @param {KeyValuePair} item
     */
    push(item) {
        if (item.constructor.name != 'KeyValuePair') {
            throw new Error('Param is not a KeyValuePair element');
        }

        const keyIsExist = this.collection.some(x => x.key == item.key)
        if (keyIsExist) {
            throw new Error('Item is already exist');
        }

        this.collection.push(item);
    }
    /**
     * Убирает последний элемент из коллекции
     * @returns {KeyValuePair}
     */
    pop() {
        return this.collection.pop();
    }

    /**
     * Убирает элемент из коллекции по ключу 
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     * @returns {KeyValuePair}
     */
    popBy(predicate) {
        const index = this.collection.findIndex(predicate);
        if (index === -1) return null;

        const item = this.collection[index];
        this.collection = this.collection.slice(index, 1);
        return item;
    }
}

const KeyValuePair = class KeyValuePair {
    constructor(key, value) {
        this.key = key;
        this.value = value;
    }
}

module.exports = { Dictionary, KeyValuePair }