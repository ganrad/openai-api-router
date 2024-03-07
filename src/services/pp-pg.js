/**
 * Name: Generic DB Entity Module/Library
 * Description: Collection of Async functions for performing CRUD operations on 
 * database entities.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 *
 * Notes:
 *
 *
*/

const pg = require('pg');
const pgvector = require('pgvector/pg');
const pgConfig = require('./pg-config');

const createTblStmts = [
  "CREATE TABLE apigtwyprompts (id serial PRIMARY KEY, requestid VARCHAR(100), aiappname VARCHAR(100), prompt JSON, timestamp_ TIMESTAMPTZ default current_timestamp)"
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
    console.log('checkDbConnection(): Postgres DB connectivity OK!');
    client.release();

    ret_val = 1;
  }
  catch (err) {
    console.log("checkDbConnection(): Encountered exception:\n" + err.stack);
  };
  return ret_val;
}

// Delete/Drop table
async function dropTable() {
  try {
    const client = await pool.connect(); // Get a connection
    await client.query(dropTblStmts[0]);
    console.log('dropTable(): Table dropped successfully!');

    client.release();
  }
  catch (err) {
    console.log("dropTable(): Encountered exception:\n" + err.stack);
  };
}

// Create table
async function createTable(idx) {
  try {
    const client = await pool.connect(); // Get a connection
    await client.query(createTblStmts[idx])
    console.log('createTable(): Table created successfully!');

    client.release();
  }
  catch (err) {
    console.log("createTable(): Encountered exception:\n" + err.stack);
  };
}

// Insert record
async function insertData(entity, query, params) {
  let stTime = Date.now();
  try {
    const client = await pool.connect();
    const res = await client.query(query,params)

    console.log(`insertData():\n  Entity: ${entity}\n  Request ID: ${params[0]}\n  Inserted recs: [${res.rowCount}]\n  Rowid: [${res.rows[0].id}]\n  Execution time: ${Date.now() - stTime}\n*****`);

    client.release();
  }
  catch (err) {
    console.log("*****\ninsertData():\n  Entity: ${entity}\n  Encountered exception:\n  " + err.stack);
  };
}

// Execute query
async function executeQuery(entity, requestid, query, params) {
  let result;
  let rows = 0;
  let data = [];

  let logLine = `executeQuery():\n  Entity: ${entity}\n  Request ID: ${requestid}\n  Query: ${query}\n`;

  let stTime = Date.now();
  try {
    const client = await pool.connect(); // Get a connection
    result = (params) ? await client.query(query, params) : await client.query(query);
   
    result.rows.map(row => {
      console.log(`  Row: ${JSON.stringify(row)}`);
      data.push(row);
      rows++;
    });
    logLine += `  Operation: ${result.command}\n  Retrieved Rows: ${rows}\n  Execution Time: ${Date.now() - stTime}\n*****`;
    console.log(logLine);
  
    client.release();
  }
  catch (err) {
    console.log("executeQuery():\n  Entity: ${entity}\n  Request ID: ${requestid}\n   Encountered exception:\n" + err.stack);
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
