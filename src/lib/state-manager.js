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
 * ID06042026: ganrad: v3.0.1: Introduced support for Anthropic's Messages API
 * ID08202026: ganrad: v3.0.1: (Bugfix) Cache & memory/state management tables now use separate fields for storing unique gateway server & instance/replica id's.
 * 
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("../utilities/logger.js");

const memoryDao = require("../services/pp-pg.js");
const { TblNames } = require("../utilities/persist-dao.js");
const { AzAiServices } = require("../utilities/app-gtwy-constants.js");

const AppTypes = [AzAiServices.OAI, AzAiServices.AzAiModelInfApi, AzAiServices.Anthropic]; // ID11042024.n; ID06042026.n

var cron = require('node-cron');

class StateManager {

  constructor() {
    this.context = null; // ID11112024.n
    // this.instanceName = null; // ID11112024.n, ID08202026.o
    this.serverName = null; // Name of the AI Gateway server; ID08202026.n
    this.replicaName = null; // Name of the pod or container app replica instance; ID08202026.n
  }

  replaceContext(ctx) { // ID11112024.n (Deprecated / Not used!)
    this.context = ctx;
    // this.instanceName = (process.env.POD_NAME) ? this.context.serverId + '-' + process.env.POD_NAME : this.context.serverId; ID08202026.o
    this.serverName = this.context.serverId; // ID08202026.n
    this.replicaName = process.env.POD_NAME || process.env.CONTAINER_APP_REPLICA_NAME || null;
  }

  runSchedule(schedule, ctx) {
    this.context = ctx; // ID11112024.n
    // this.instanceName = (process.env.POD_NAME) ? this.context.serverId + '-' + process.env.POD_NAME : this.context.serverId; // ID11112024.n, ID08202026.o
    this.serverName = this.context.serverId; // ID08202026.n
    this.replicaName = process.env.POD_NAME || process.env.CONTAINER_APP_REPLICA_NAME || null;

    cron.schedule(schedule, () => {      
      logger.log({ level: "info", message: "[%s] %s.runSchedule(): Server ID=[%s], Replica ID=[%s], Cron schedule=[%s]", splat: [scriptName, this.constructor.name, this.serverName, this.replicaName, schedule] }); // ID08202026.n

      // ctx.applications.forEach(async (app) => { ID11112024.o
      this.context.applications?.forEach(async (app) => { // ID11112024.n
        // if ( (app.appType === AzAiServices.OAI) && app.memorySettings?.useMemory ) { // ID11042024.o
        if ( AppTypes.includes(app.appType) && app.memorySettings?.useMemory ) { // ID11042024.n
          let entryExpiry = app.memorySettings.entryExpiry;

          let query;
          if (entryExpiry) {
            // query = `DELETE FROM apigtwymemory WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`; ID11112024.o
            // query = `DELETE FROM apigtwymemory WHERE (srv_name = '${this.instanceName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`; // ID11112024.n, ID08202026.o
            // const values = [ app.appId, entryExpiry ]; Using params causes the delete stmt to fail!

            query = (this.replicaName !== null) ? // ID08202026.n
              `DELETE FROM apigtwymemory WHERE (srv_name = '${this.serverName}') AND (instance = '${this.replicaName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` : 
              `DELETE FROM apigtwymemory WHERE (srv_name = '${this.serverName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`; // ID11112024.n

            await memoryDao.deleteData(TblNames.Memory, query, null);
          };
        };
      });
    });
  } // end of runSchedule()
} // end of class

module.exports = StateManager;