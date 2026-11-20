const { KeyValuePair } = require('../KeyValuePair');

//�� ��� ��� �������
const PairedQueie = class PairedQueie {
    constructor() {
        /** @type {KeyValuePair[]} */
        this.collection = new Array();
    }

    /**
     * ��������� �������� � ���������
     * @param {KeyValuePair[]} items
     */
    pushes(items) {
        if (!Array.isArray(items)) {
            throw new Error('Param is not a array');
        }

        if (items.some(x => x.constructor.name != KeyValuePair.constructor.name)) {
            throw new Error('One of param is not a KeyValuePair element');
        }

        this.collection.push(...items);
    }

    /**
     * ��������� ������� ���������
     * @param {number} index
     * @param {KeyValuePair} item
     */
    update(index, item) {
        if (index.constructor.name != Number.constructor.name) {
            throw new Error('Param index is not a number');
        }

        if (item.constructor.name != KeyValuePair.constructor.name) {
            throw new Error('Param item is not a KeyValuePair');
        }

        this.collection[index] = item;
    }

    /**
     * ������� ������ ������� ��������
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     * @returns {number}
     */
    findIndex(predicate) {
        return this.collection.findIndex(predicate);
    }

    /**
     * ��������� �� ��������� ������ �������
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     * @returns {KeyValuePair|undefined}
     */
    shiftBy(predicate) {
        const index = this.collection.findIndex(predicate);
        if (index === -1) return undefined;

        const item = this.collection[index];
        this.collection.splice(index, 1);
        return item;
    }
}

module.exports = { PairedQueie }