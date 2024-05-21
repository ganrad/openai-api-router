const pgvector = require('pgvector/pg');

const db = require("../src/services/cp-pg");
const pdb = require("../src/services/pp-pg");
const { TblNames, PersistDao }  = require("../src/utilities/persist-dao");

/**
 * Create PostgreSQL DB resources
 *
*/
async function createDBResources() {
  await db.dropTable();
  await db.createTable(1);

  // Query rows in 'Cache' table
  let cacheDao = new PersistDao(pdb,TblNames.Cache);
  await cacheDao.queryTable('001',1,null);

  console.log("***** End of Cache Table; Begin Prompts Table; *****");

  await pdb.dropTable(0);
  await pdb.createTable(0);

  // Query rows in 'Prompts' table
  let promptDao = new PersistDao(pdb,TblNames.Prompts);
  await promptDao.queryTable('001',0,null);

  console.log("***** End of Prompts Table; Begin Memory Table; *****");

  await pdb.dropTable(1);
  await pdb.createTable(1);

  // Query rows in 'Prompts' table
  let memoryDao = new PersistDao(pdb,TblNames.Memory);
  await memoryDao.queryTable('001',0,null);

  console.log("***** End of Memory Table; *****");
  // await new Promise(r => setTimeout(r, 2000));
}

createDBResources();
