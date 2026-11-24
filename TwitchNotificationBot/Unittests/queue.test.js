const assert = require('node:assert/strict');
const { Queue } = require('../domain/Queue');

describe('Queue', function () {
    it('puts items at the end and takes them from the front', function () {
        const queue = new Queue();
        assert.equal(queue.length, 0);
        assert.equal(queue.peek(), undefined);
        assert.equal(queue.dequeue(), undefined);

        queue.enqueue('first');
        queue.enqueue('second');
        assert.equal(queue.length, 2);
        assert.equal(queue.peek(), 'first');
        assert.equal(queue.length, 2);

        assert.equal(queue.dequeue(), 'first');
        assert.equal(queue.peek(), 'second');
        assert.equal(queue.dequeue(), 'second');
        assert.equal(queue.length, 0);
        assert.equal(queue.dequeue(), undefined);
    });
});
