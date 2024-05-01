/**
 * Name: Semantic cache entry invalidator
 * Description: This module runs a cron job at the pre-configured schedule to invalidate (delete)
 * expired entries in the semantic cache table - apigtwycache.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-15-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("./logger.js");

const cacheTbl = require("../services/cp-pg.js");
var cron = require('node-cron');

const deleteRowStmts = [
  "DELETE FROM apigtwycache WHERE (aiappname = $1) AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL $2)"
  ];

function runCacheInvalidator(schedule, ctx) {
  let context = ctx

  cron.schedule(schedule, () => {
    // console.log(`*****\nrunCacheInvalidator(): ${new Date().toLocaleString()}`);
    logger.log({level: "info", message: "[%s] runCacheInvalidator(): Cron schedule=[%s]", splat: [scriptName, schedule]});

    let values;
    let query;

    context.applications.forEach(async (app) => {
      if ( app.cacheSettings.useCache ) {
        let entryExpiry = app.cacheSettings.entryExpiry;

        if ( entryExpiry ) {
        // values = [app.appId, entryExpiry]
        // await cacheTbl.deleteData(deleteRowStmts[0],values);

          query = `DELETE FROM apigtwycache WHERE (aiappname = '${app.appId}') AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL '${entryExpiry}')`
          // console.log(`  appId=${app.appId}\n  entryExpiry=${entryExpiry}\n  query=${query}`);
          await cacheTbl.deleteData(query,null);
        };
      };
    });
  });
}

module.exports = runCacheInvalidator;
