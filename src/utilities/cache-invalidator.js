/**
 * Name: Semantic cache entry invalidator
 * Description: This class implements a scheduler that periodically runs a process to invalidate (delete)
 * expired cache entries in the semantic cache table - apigtwycache. 
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-15-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID05062024: ganrad: Converted this module to a class
 * ID11042024: ganrad: v2.1.0: (Enhancement) Added support for LLMs which use Azure AI Model Inference API (Chat completion).
 * ID11112024: ganrad: v2.1.0: (Bugfix) After re-configuring a server, the scheduler was still using the old app config. invalidation interval!
 * ID11112024: ganrad: v2.1.0: (Enhancement) Cache invalidator should only delete cached entries which were either created/updated by the associated
 * server instance.
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("./logger.js");

const cacheDao = require("../services/cp-pg.js");
var cron = require('node-cron');

const { AzAiServices } = require("./app-gtwy-constants.js");
const AppTypes = [AzAiServices.OAI, AzAiServices.AzAiModelInfApi]; // ID11042024.n

class CacheEntryInvalidator {

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
      // console.log(`*****\nrunCacheInvalidator(): ${new Date().toLocaleString()}`);
      logger.log({level: "info", message: "[%s] %s.runSchedule(): Instance ID=[%s], Cron schedule=[%s]", splat: [scriptName, this.constructor.name, this.instanceName, schedule]});

      let query;
      // ctx.applications.forEach(async (app) => { ID11112024.o
      this.context.applications?.forEach(async (app) => { // ID11112024.n
        // if ( (app.appType === AzAiServices.OAI) && app.cacheSettings.useCache ) { ID11042024.o
        if ( AppTypes.includes(app.appType) && app.cacheSettings?.useCache ) { // ID11042024.n
          let entryExpiry = app.cacheSettings.entryExpiry;

          if ( entryExpiry ) {
            // query = `DELETE FROM apigtwycache WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` ID11112024.o
            query = `DELETE FROM apigtwycache WHERE (srv_name = '${this.instanceName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` // ID11112024.n
            // console.log(`  appId=${app.appId}\n  entryExpiry=${entryExpiry}\n  query=${query}`);
            await cacheDao.deleteData(query,null);
          };
        };
      });
    });
  } // end of runSchedule()
} // end of class

module.exports = CacheEntryInvalidator;