/**
 * Name: Queue (FIFO)
 * Description: A data structure for storing api call metrics in memory.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-22-2024
 *
 * Notes:
 *
*/

class Queue {
  static CINDEX_RESET_COUNT = 1000; // Cache index reset count

  constructor(itemCount) {
    this.itemCount = itemCount;

    this.items = {};
    this.fidx = 0;
    this.bidx = 0;
  }
 
  enqueue(item) {
    this.items[this.bidx] = item;
    this.bidx++;

    if ( Object.keys(this.items).length > this.itemCount )
      this.dequeue();

    if ( this.bidx >= Queue.CINDEX_RESET_COUNT )
      this.bidx = 0;

    return item;
  }

  dequeue() {
    const item = this.items[this.fidx];
    delete this.items[this.fidx];
    this.fidx++

    if ( this.fidx >= Queue.CINDEX_RESET_COUNT )
      this.fidx = 0;

    return item;
  }

  peek() {
    return this.items[this.fidx]
  }

  get queueItems() {
    return this.items;
  }
}

module.exports = Queue;
