/**
 * Name: Job scheduler Factory
 * Description: A factory class that instantiates job schedulers that start and run background workers.
 * Currently supported schedulers:
 * - CacheEntryInvalidator
 * - MemoryStateManager
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-06-2024
 *
 * Notes:
 *
*/

const CacheEntryInvalidator = require("./cache-invalidator.js"); 
const StateManager = require("./state-manager.js");
const { SchedulerTypes } = require("./app-gtwy-constants.js");

class SchedulerFactory {

  constructor() { // Singleton 
    if (! SchedulerFactory.instance)
      SchedulerFactory.instance = this;

    return SchedulerFactory.instance;
  }
 
  getScheduler(type) {
    let schedulerObj = null;

    switch (type) {
      case SchedulerTypes.InvalidateCacheEntry:
        schedulerObj = new CacheEntryInvalidator();
        break;
      case SchedulerTypes.ManageMemory:
        schedulerObj = new StateManager();
        break;
    };

    return schedulerObj;
  }
}

module.exports = SchedulerFactory;
