/**
 * Name: SQL DB Script
 * Description: This script creates the DB Tables used by AI App Gateway
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 * Version: 1.0.0
 *
 * Notes:
 * ID10262024: ganrad: v2.1.0: Introduced table aiapptoolstrace to capture tool execution details for multi-domain AI Apps.
 */

const pgvector = require('pgvector/pg');

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

  console.log("***** End of Tools Trace Table *****");
  // await new Promise(r => setTimeout(r, 2000));
}

const args = process.argv.slice(2);
let deleteTables = false;
if ( (args.length > 0) && (args[0] == "drop-tables") ) 
  deleteTables = true;
  
createDBResources();