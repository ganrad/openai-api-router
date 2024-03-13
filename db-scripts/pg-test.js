const pgvector = require('pgvector/pg');

const db = require("../src/services/cp-pg");
const pdb = require("../src/services/pp-pg");
const { tblNames, PersistDao }  = require("../src/utilities/persist-dao");

/**
 * Create PostgreSQL DB resources
 *
*/
async function createDBResources() {
  await db.dropTable();
  await db.createTable(1);

  // Query rows in 'Cache' table
  let cacheDao = new PersistDao(pdb,tblNames.cache);
  await cacheDao.queryTable('001',1,null);

  await pdb.dropTable();
  await pdb.createTable(0);

  console.log("***** End of Cache Table; Begin Prompts Table; *****");

  // Query rows in 'Prompts' table
  let promptDao = new PersistDao(pdb,tblNames.prompts);
  await promptDao.queryTable('001',0,null);

  // await new Promise(r => setTimeout(r, 2000));
}

createDBResources();
