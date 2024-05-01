/**
 * Name: Generic DB Entity Module/Library
 * Description: Collection of Async functions for performing CRUD operations on 
 * database entities.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 *
 * Notes:
 * ID04112024: ganrad: Added 'completion' and 'user' columns to table 'apigtwyprompts'
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger'); // ID04272024.n

const pg = require('pg');
const pgvector = require('pgvector/pg');
const pgConfig = require('./pg-config');

const createTblStmts = [
  // "CREATE TABLE apigtwyprompts (id serial PRIMARY KEY, requestid VARCHAR(100), aiappname VARCHAR(100), prompt JSON, timestamp_ TIMESTAMPTZ default current_timestamp)" // ID04112024.o
  "CREATE TABLE apigtwyprompts (id serial PRIMARY KEY, requestid VARCHAR(100), aiappname VARCHAR(100), uname VARCHAR(50), prompt JSON, completion JSON, timestamp_ TIMESTAMPTZ default current_timestamp)" // ID04112024.n
  ];

const dropTblStmts = [
  "DROP TABLE IF EXISTS apigtwyprompts;"
  ];

// Initialize the DB connection pool
const pool = new pg.Pool(pgConfig.db);

// Initialize pgvector library
pool.on('connect',async function (client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pgvector.registerType(client);
});

// Check Vector DB Connection
async function checkDbConnection() {
  let ret_val = 0; 
  try {
    const client = await pool.connect(); // Get a connection
    // console.log('checkDbConnection(): Postgres DB connectivity OK!');
    logger.log({level: 'info', message: '[%s] checkDbConnection(): Postgres DB connectivity OK!', splat: [scriptName]});
    client.release();

    ret_val = 1;
  }
  catch (err) {
    // console.log("checkDbConnection(): Encountered exception:\n" + err.stack);
    logger.log({level: "error", message: "[%s] checkDbConnection(): Encountered exception:\n%s", splat: [scriptName, err.stack]});
  };
  return ret_val;
}

// Delete/Drop table
async function dropTable() {
  try {
    const client = await pool.connect(); // Get a connection
    await client.query(dropTblStmts[0]);
    // console.log('dropTable(): Table dropped successfully!');
    logger.log({level: 'info', message: '[%s] dropTable(): Table dropped successfully!', splat: [scriptName]});

    client.release();
  }
  catch (err) {
    // console.log("dropTable(): Encountered exception:\n" + err.stack);
    logger.log({level: "error", message: "[%s] dropTable(): Encountered exception:\n%s", splat: [scriptName, err.stack]});
  };
}

// Create table
async function createTable(idx) {
  try {
    const client = await pool.connect(); // Get a connection
    await client.query(createTblStmts[idx])
    // console.log('createTable(): Table created successfully!');
    logger.log({level: 'info', message: '[%s] createTable(): Table created successfully!', splat: [scriptName]});

    client.release();
  }
  catch (err) {
    // console.log("createTable(): Encountered exception:\n" + err.stack);
    logger.log({level: "error", message: "[%s] createTable(): Encountered exception:\n%s", splat: [scriptName, err.stack]});
  };
}

// Insert record
async function insertData(entity, query, params) {
  let stTime = Date.now();
  try {
    const client = await pool.connect();
    const res = await client.query(query,params)

    // console.log(`insertData():\n  Entity: ${entity}\n  Request ID: ${params[0]}\n  Inserted recs: [${res.rowCount}]\n  Rowid: [${res.rows[0].id}]\n  Execution time: ${Date.now() - stTime}\n*****`);
    logger.log({level: "info", message: "[%s] insertData():\n  Entity: %s\n  Request ID: %s\n  Inserted recs: [%d]\n  Rowid: [%d}]\n  Execution time: %d", splat: [scriptName,entity,params[0],res.rowCount,res.rows[0].id,Date.now() - stTime]});

    client.release();
  }
  catch (err) {
    // console.log("*****\ninsertData():\n  Entity: ${entity}\n  Encountered exception:\n  " + err.stack);
    logger.log({level: "error", message: "[%s] insertData():\n  Entity: %s\n  Encountered exception:\n%s", splat: [scriptName,entity,err.stack]});
  };
}

// Execute query
async function executeQuery(entity, requestid, query, params) {
  let result;
  let rows = 0;
  let data = [];

  // let logLine = `executeQuery():\n  Entity: ${entity}\n  Request ID: ${requestid}\n  Query: ${query}\n`;
  let logLine = "[%s] executeQuery():\n  Entity: %s\n  Request ID: %s\n  Query: %s\n";

  let stTime = Date.now();
  try {
    const client = await pool.connect(); // Get a connection
    result = (params) ? await client.query(query, params) : await client.query(query);
   
    result.rows.map(row => {
      // console.log(`  Row: ${JSON.stringify(row)}`);
      data.push(row);
      rows++;
    });
    // logLine += `  Operation: ${result.command}\n  Retrieved Rows: ${rows}\n  Execution Time: ${Date.now() - stTime}\n*****`;
    logLine += "  Operation: %s\n  Retrieved Rows: %d\n  Execution Time: %d";
    // console.log(logLine);
    logger.log({level: "info", message: logLine, splat: [scriptName,entity,requestid,result.command,rows,Date.now() - stTime]});
  
    client.release();
  }
  catch (err) {
    // console.log("executeQuery():\n  Entity: ${entity}\n  Request ID: ${requestid}\n  Encountered exception:\n" + err.stack);
    logger.log({level: "error", message: "[%s] executeQuery():\n  Entity: %s\n  Request ID: %s\n  Encountered exception:\n%s", splat: [scriptName,entity,requestid,err.stack]});
  };

  return {
    rowCount: rows,
    completion: data // Rows data []
  };
}

module.exports = {
  checkDbConnection,
  dropTable,
  createTable,
  insertData,
  executeQuery
}
