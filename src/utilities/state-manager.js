/**
 * Name: Conversational state manager
 * Description: This class implements a scheduler that periodically runs a process to delete
 * expired state/context entries from the memory table - apigtwymemory. 
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-06-2024
 *
 * Notes:
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("./logger.js");

const memoryDao = require("../services/pp-pg.js");
const { TblNames } = require("./persist-dao.js");
const { AzAiServices } = require("./app-gtwy-constants.js");

var cron = require('node-cron');

class StateManager {

  constructor() {
  }

  async runSchedule(schedule, ctx) {
    cron.schedule(schedule, () => {
      logger.log({level: "info", message: "[%s] %s.runSchedule(): Cron schedule=[%s]", splat: [scriptName, this.constructor.name, schedule]});

      ctx.applications.forEach(async (app) => {
        if ( (app.appType === AzAiServices.OAI) && app.memorySettings?.useMemory ) {
          let entryExpiry = app.memorySettings.entryExpiry;

	  let query;
          if ( entryExpiry ) {
            query = `DELETE FROM apigtwymemory WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`;
	    // const values = [ app.appId, entryExpiry ]; Using params causes the delete stmt to fail!

            await memoryDao.deleteData(TblNames.Memory, query, null);
          };
        };
      });
    });
  } // end of runSchedule()
} // end of class

module.exports = StateManager;
