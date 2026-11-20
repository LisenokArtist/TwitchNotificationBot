const { KeyValuePair } = require('../KeyValuePair');

/** �������� ��� ��������� ������ �� ����������� */
const Dictionary = class Dictionary {
    constructor() {
        /** @type {KeyValuePair[]} */
        this.collection = new Array();

    }

    /**
     * ������� ������ �������� ���������
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     * @returns {Number}
     */
    findIndex(predicate) {
        return this.collection.findIndex(predicate);
    }

    /**
     * ��������� ������� � ���������
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
     * ������� ��������� ������� �� ���������
     * @returns {KeyValuePair}
     */
    pop() {
        return this.collection.pop();
    }

    /**
     * ������� ������ ������� �� ��������� �� ����� 
     * @param {(obj: KeyValuePair, index: number, array: KeyValuePair[])} predicate
     * @returns {KeyValuePair}
     */
    shiftBy(predicate) {
        const index = this.collection.findIndex(predicate);
        if (index === -1) return null;

        const item = this.collection[index];
        this.collection.splice(index, 1);
        return item;
    }
}

module.exports = { Dictionary }