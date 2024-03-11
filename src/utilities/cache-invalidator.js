const cacheTbl = require("../services/cp-pg.js");
var cron = require('node-cron');
var context;

const deleteRowStmts = [
  "DELETE FROM apigtwycache WHERE (aiappname = $1) AND (timestamp_ < CURRENT_TIMESTAMP - INTERVAL $2)"
  ];

function runCacheInvalidator(schedule, ctx) {
  context = ctx

  cron.schedule(schedule, () => {
    console.log("*****\nrunCacheInvalidator():");

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

module.exports = {
  runCacheInvalidator
}
