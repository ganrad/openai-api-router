/**
 * Name: Conversational state manager
 * Description: This class implements a scheduler that periodically runs a process to delete
 * expired state/context entries from the memory table - apigtwymemory. 
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-06-2024
 *
 * Notes:
 * ID11042024: ganrad: v2.1.0: (Enhancement) Added support for LLMs which use Azure AI Model Inference API (Chat completion).
 * ID11112024: ganrad: v2.1.0: (Bugfix) After re-configuring a server, the scheduler was still using the old app config. state eviction interval!
 * ID11112024: ganrad: v2.1.0: (Enhancement) State manager should only delete memory records which were either created/updated by the associated
 * server instance.
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("./logger.js");

const memoryDao = require("../services/pp-pg.js");
const { TblNames } = require("./persist-dao.js");
const { AzAiServices } = require("./app-gtwy-constants.js");

const AppTypes = [AzAiServices.OAI, AzAiServices.AzAiModelInfApi]; // ID11042024.n

var cron = require('node-cron');

class StateManager {

  constructor() {
    this.context = null; // ID11112024.n
    this.instanceName = null; // ID11112024.n
  }

  replaceContext(ctx) { // ID11112024.n
    this.context = ctx;
    this.instanceName = (process.env.POD_NAME) ? this.context.serverId + '-' + process.env.POD_NAME : this.context.serverId;
  }

  runSchedule(schedule, ctx) {
    this.context = ctx; // ID11112024.n
    this.instanceName = (process.env.POD_NAME) ? this.context.serverId + '-' + process.env.POD_NAME : this.context.serverId; // ID11112024.n

    cron.schedule(schedule, () => {      
      logger.log({ level: "info", message: "[%s] %s.runSchedule(): Instance ID=[%s], Cron schedule=[%s]", splat: [scriptName, this.constructor.name, this.instanceName, schedule] });

      // ctx.applications.forEach(async (app) => { ID11112024.o
      this.context.applications.forEach(async (app) => { // ID11112024.n
        // if ( (app.appType === AzAiServices.OAI) && app.memorySettings?.useMemory ) { // ID11042024.o
        if ( AppTypes.includes(app.appType) && app.memorySettings?.useMemory ) { // ID11042024.n
          let entryExpiry = app.memorySettings.entryExpiry;

          let query;
          if (entryExpiry) {
            // query = `DELETE FROM apigtwymemory WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`; ID11112024.o
            query = `DELETE FROM apigtwymemory WHERE (srv_name = '${this.instanceName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`; // ID11112024.n
            // const values = [ app.appId, entryExpiry ]; Using params causes the delete stmt to fail!

            await memoryDao.deleteData(TblNames.Memory, query, null);
          };
        };
      });
    });
  } // end of runSchedule()
} // end of class

module.exports = StateManager;