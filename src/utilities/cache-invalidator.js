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
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("./logger.js");

const cacheDao = require("../services/cp-pg.js");
var cron = require('node-cron');

const { AzAiServices } = require("./app-gtwy-constants.js");

class CacheEntryInvalidator {

  constructor() {
  }

  async runSchedule(schedule, ctx) {

    cron.schedule(schedule, () => {
      // console.log(`*****\nrunCacheInvalidator(): ${new Date().toLocaleString()}`);
      logger.log({level: "info", message: "[%s] %s.runSchedule(): Cron schedule=[%s]", splat: [scriptName, this.constructor.name, schedule]});

      let query;
      ctx.applications.forEach(async (app) => {
        if ( (app.appType === AzAiServices.OAI) && app.cacheSettings.useCache ) {
          let entryExpiry = app.cacheSettings.entryExpiry;

          if ( entryExpiry ) {
            query = `DELETE FROM apigtwycache WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`
            // console.log(`  appId=${app.appId}\n  entryExpiry=${entryExpiry}\n  query=${query}`);
            await cacheDao.deleteData(query,null);
          };
        };
      });
    });
  } // end of runSchedule()
} // end of class

module.exports = CacheEntryInvalidator;
