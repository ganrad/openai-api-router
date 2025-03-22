/**
 * Name: SQL DB Script
 * Description: This script creates the DB Tables used by AI Application Gateway
 * Usage:
 * From the project root directory issue the following command. CAUTION: When 'drop-tables' option is
 * used, all tables are dropped and then recreated.
 * Command to run:
 *   node ./db-scripts/pg-test.js [drop-tables]
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 * Version: 1.0.0
 *
 * Notes:
 * ID10262024: ganrad: v2.1.0: Introduced table aiapptoolstrace to capture tool execution details for multi-domain AI Apps.
 * ID01232025: ganrad: v2.2.0: Introduced table aiappdeploy to store new AI Application deployment requests.
 * ID01272025: ganrad: v2.2.0: Introduced table aiappservers to store AI app server and application definitions.
 */

// const pgvector = require('pgvector/pg');

const db = require("../src/services/cp-pg");
const pdb = require("../src/services/pp-pg");
const { TblNames, PersistDao }  = require("../src/utilities/persist-dao");

/**
 * Create PostgreSQL DB resources
 *
*/
async function createDBResources() {
  console.log("***** Begin Cache Table; *****");

  // Delete and create 'apigtwycache' table
  if ( deleteTables )
    await db.dropTable();
  await db.createTable(1);

  // Query rows in 'Cache' table
  let cacheDao = new PersistDao(pdb,TblNames.Cache);
  await cacheDao.queryTable('001',0,null);

  console.log("***** End of Cache Table; *****\n\n***** Begin Prompts Table; *****");

  // Delete and create 'apigtwyprompts' table
  if ( deleteTables )
    await pdb.dropTable(0);
  await pdb.createTable(0);

  // Query rows in 'Prompts' table
  let promptDao = new PersistDao(pdb,TblNames.Prompts);
  await promptDao.queryTable('001',0,null);

  console.log("***** End of Prompts Table; *****\n\n***** Begin Memory Table; *****");

  // Delete and create 'apigtwymemory' table
  if ( deleteTables )
    await pdb.dropTable(1);
  await pdb.createTable(1);

  // Query rows in 'Memory' table
  let memoryDao = new PersistDao(pdb,TblNames.Memory);
  await memoryDao.queryTable('001',0,null);

  console.log("***** End of Memory Table; *****\n\n***** Begin Tools Trace Table; *****");

  // Delete and create 'aiapptoolstrace' table
  if ( deleteTables )
    await pdb.dropTable(2); // ID10262024.sn
  await pdb.createTable(2);

  // Query rows in 'ToolsTrace' table
  let toolsDao = new PersistDao(pdb,TblNames.ToolsTrace);
  await toolsDao.queryTable('001',0,null);

  // ID01232025.sn
  console.log("***** End of Tools Trace Table; *****\n\n***** Begin AI App Deploy Table; *****"); 

  // Delete and create 'aiappdeploy' table
  if ( deleteTables )
    await pdb.dropTable(3);
  await pdb.createTable(3);

  // Query rows in 'ToolsTrace' table
  let appdeployDao = new PersistDao(pdb,TblNames.AiAppDeploy);
  await appdeployDao.queryTable('001',0,null);
  // ID01232025.en

  // ID01272025.sn
  console.log("***** End of AI App Deploy Table; *****\n\n***** Begin AI App Servers Table; *****"); 

  // Delete and create 'aiappdeploy' table
  if ( deleteTables )
    await pdb.dropTable(4);
  await pdb.createTable(4);

  // Query rows in 'ToolsTrace' table
  let appsrvsDao = new PersistDao(pdb,TblNames.AiAppServers);
  await appsrvsDao.queryTable('001',0,null);
  // ID01272025.en

  console.log("***** End of AI App Servers Table *****");
  // await new Promise(r => setTimeout(r, 2000));
}

const args = process.argv.slice(2);
let deleteTables = false;
if ( (args.length > 0) && (args[0] == "drop-tables") ) 
  deleteTables = true;
  
createDBResources();