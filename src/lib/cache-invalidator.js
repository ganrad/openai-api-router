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
 * ID11252025: ganrad: v2.9.5: (Enhancement) Check and invalidate/evict cached entries from L2 cache ~ Qdrant
 * ID06042026: ganrad: v3.0.1: Introduced support for Anthropic's Messages API
 * ID08202026: ganrad: v3.0.1: (Bugfix) Cache & memory/state management tables now use separate fields for storing unique gateway server & instance/replica id's.
 * 
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("../utilities/logger.js");

const cacheDao = require("../services/cp-pg.js");
var cron = require('node-cron');

const { AzAiServices } = require("../utilities/app-gtwy-constants.js");
const { cleanupL2ExpiredQdrantEntries } = require("../utilities/helper-funcs.js"); // ID11252025.n
const AppTypes = [AzAiServices.OAI, AzAiServices.AzAiModelInfApi, AzAiServices.Anthropic]; // ID11042024.n; ID06042026.n

class CacheEntryInvalidator {

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
      // console.log(`*****\nrunCacheInvalidator(): ${new Date().toLocaleString()}`);
      logger.log({ level: "info", message: "[%s] %s.runSchedule(): Server ID=[%s], Replica ID=[%s], Cron schedule=[%s]", splat: [scriptName, this.constructor.name, this.serverName, this.replicaName, schedule] }); // ID08202026.n

      let query;
      // ctx.applications.forEach(async (app) => { ID11112024.o
      this.context.applications?.forEach(async (app) => { // ID11112024.n
        // if ( (app.appType === AzAiServices.OAI) && app.cacheSettings.useCache ) { ID11042024.o
        if (AppTypes.includes(app.appType) && app.cacheSettings?.useCache) { // ID11042024.n
          let entryExpiry = app.cacheSettings.entryExpiry;

          // Evict entry from L3 cache after it expires
          if (entryExpiry) {
            // query = `DELETE FROM apigtwycache WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` ID11112024.o
            // query = `DELETE FROM apigtwycache WHERE (srv_name = '${this.instanceName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` // ID11112024.n, ID08202026.o

            query = (this.replicaName !== null) ? // ID08202026.n
              `DELETE FROM apigtwycache WHERE (srv_name = '${this.serverName}') AND (instance = '${this.replicaName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` : 
              `DELETE FROM apigtwycache WHERE (srv_name = '${this.serverName}') AND (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')` // ID08202026.n

            // console.log(`  appId=${app.appId}\n  entryExpiry=${entryExpiry}\n  query=${query}`);
            await cacheDao.deleteData(query, null);
          };

          // Evict entry from L2 cache after it expires
          // Every replica of a server will run this entry deletion code. CPU cycles consumed should be infintesimal secs. 
          if (app.cacheSettings.level2Cache) { // ID11252025.n
            const l2Config = app.cacheSettings.level2Cache;

            await cleanupL2ExpiredQdrantEntries(this.context.serverId, app.appId, l2Config);
          };
        };
      });
    });
  } // end of runSchedule()
} // end of class

module.exports = CacheEntryInvalidator;