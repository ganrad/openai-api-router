/**
 * Name: Cache DB Entity Module/Library
 * Description: Collection of Async functions for performing CRUD operations on 
 * 'Cache' entity.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-20-2024
 *
 * Notes:
 *
 *
*/

const pg = require('pg');
const pgvector = require('pgvector/pg');
const pgConfig = require('./pg-config');
var cron = require('node-cron');

const createTblStmts = [
  // Use this DDL for testing only!
  "CREATE TABLE apigtwycache (id serial PRIMARY KEY, aiappname VARCHAR(100), prompt text, embedding vector(3), completion JSON, timestamp_ TIMESTAMPTZ default current_timestamp)",
  "CREATE TABLE apigtwycache (id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, requestid VARCHAR(50), aiappname VARCHAR(100), prompt text, embedding vector(1536), completion JSON, timestamp_ TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
  ];

const dropTblStmts = [
  "DROP TABLE IF EXISTS apigtwycache;"
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
  let query = `SELECT id FROM apigtwycache LIMIT 1`;

  /**
  let retVal = 0;
  pool.query(query, (err, results) => {
    if (err) {
      console.log("checkDbConnection(): Encountered exception: " + err);
    };
    console.log('checkDbConnection(): Postgres DB connectivity OK!');
    retVal = results.rowCount;
  });
  return retVal;
  */

  let ret_val = 0; 
  try {
    const client = await pool.connect(); // Get a connection
    // let result = await client.query(query);
    console.log('checkDbConnection(): Postgres DB connectivity OK!');
     
    client.release();
    // ret_val = result.rowCount;
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

// Insert vector record
async function insertData(query, params) {
  let stTime = Date.now();

  try {
    const client = await pool.connect();
    const res = await client.query(query,params)

    console.log(`insertData():\n  Entity: Cache\n  Request ID: ${params[0]}\n  Inserted recs: [${res.rowCount}]\n  Rowid: [${res.rows[0].id}]\n  Execution time: ${Date.now() - stTime}\n*****`);

    client.release();
  }
  catch (err) {
    console.log("*****\ninsertData():\n  Encountered exception:\n  " + err.stack);
  };
}

// Delete records
async function deleteData(query, params) {
  let stTime = Date.now();
  let logLine = `deleteData():\n`;

  try {
    const client = await pool.connect();
    const res = (params) ? await client.query(query, params) : await client.query(query);

    logLine += `  Query: ${query}\n`;
    if ( params )
      logLine += `  App. Id: ${params[0]}\n  Entity Expiry: ${params[1]}\n`

    logLine += `  Entity: Cache\n  Deleted recs: [${res.rowCount}]\n  Execution time: ${Date.now() - stTime}\n*****`;

    console.log(logLine);

    client.release();
  }
  catch (err) {
    console.log("*****\ndeleteData():\n  Encountered exception:\n  " + err.stack);
  };
}

// Execute query
async function executeQuery(requestid,query, params) {
  let result;
  let rows = 0;
  let data = null;
  let score = 0;

  let logLine = `executeQuery():\n  Entity: Cache\n  Request ID: ${requestid}\n  Query: ${query}\n`;

  let stTime = Date.now();
  try {
    const client = await pool.connect(); // Get a connection
    result = (params) ? await client.query(query, params) : await client.query(query);
   
    result.rows.map(row => {
      // console.log(`  Completion: ${JSON.stringify(row)}`);
      score = row.similarity;
      data = row.completion;
      rows++;
    });

    logLine += `  Operation: ${result.command}\n  Retrieved Rows: ${rows}\n  Similarity Score: ${score}\n  Execution Time: ${Date.now() - stTime}\n*****`;
    console.log(logLine);
  
    client.release();
  }
  catch (err) {
    console.log("executeQuery():\n  Request ID: ${requestid}\n   Encountered exception:\n" + err.stack);
  };

  return {
    rowCount: rows, // No. of rows (0 / 1)
    simScore: score, // Similarity score
    completion: data // Completion data
  };
}

module.exports = {
  checkDbConnection,
  dropTable,
  createTable,
  insertData,
  deleteData,
  executeQuery,
}
