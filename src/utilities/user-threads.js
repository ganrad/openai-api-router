/**
 * Name: UserThreads
 * Description: This class serves as a container for storing and managing the lifecycle of user threads (IDs)
 * for a multi-domain AI App Gateway.
 * 
 * Level 1 cache: In-memory
 * Level 2 cache: SQL-DB
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 *
*/

const MaxEntries = 100; // Max. thread entries which will be maintained 'in-memory'

class UserThreads {
  constructor() {
    // key: ThreadId
    // value: ToolName
    this.store = new Map();
  }

  set(threadId, toolName) {
    if ( this.size() >= MaxEntries ) {
      // Remove the first inserted element
      const firstKey = this.store.keys().next().value;
      this.delete(firstKey);
    };
    this.store.set(threadId,toolName);
  }

  get(key) {
    return this.store.get(key);
  }

  delete(key) {
    return this.store.delete(key);
  }

  has(key) {
    return this.store.has(key);
  }

  size() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  entries() {
    return this.store.entries();
  }
} // end of class

module.exports = UserThreads;
