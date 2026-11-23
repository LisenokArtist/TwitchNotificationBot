/**
 * Очередь FIFO. Хранилище скрыто: снаружи только постановка и снятие.
 * @template T
 */
class Queue {
    /** @type {T[]} */
    #items = [];

    /**
     * Ставит элемент в конец.
     * @param {T} item
     */
    enqueue(item) {
        this.#items.push(item);
    }

    /**
     * Возвращает первый элемент, не удаляя его.
     * @returns {T|undefined}
     */
    peek() {
        if (this.#items.length === 0) {
            return undefined;
        }

        return this.#items[0];
    }

    /**
     * Снимает и возвращает первый элемент.
     * @returns {T|undefined}
     */
    dequeue() {
        return this.#items.shift();
    }

    /**
     * Число элементов в очереди.
     * @returns {number}
     */
    get length() {
        return this.#items.length;
    }
}

module.exports = { Queue };
