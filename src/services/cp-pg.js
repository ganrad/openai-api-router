const pg = require('pg');
const pgvector = require('pgvector/pg');
const pgConfig = require('./pg-config');

const createTblStmts = [
  // Use this DDL for testing only!
  "CREATE TABLE apigtwycache (id serial PRIMARY KEY, aiappname VARCHAR(100), prompt text, embedding vector(3), completion JSON, timestamp_ TIMESTAMPTZ default current_timestamp)",
  "CREATE TABLE apigtwycache (id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, aiappname VARCHAR(100), prompt text, embedding vector(1536), completion JSON, timestamp_ TIMESTAMP default current_timestamp)"
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

async function insertData(query, params) {
  let stTime = Date.now();
  try {
    const client = await pool.connect();
    const res = await client.query(query,params)
    console.log(`insertData():\n  Inserted recs: [${res.rowCount}]\n  Rowid: [${res.rows[0].id}]\n  Execution time: ${Date.now() - stTime}\n*****`);

    client.release();
  }
  catch (err) {
    console.log("insertData(): Encountered exception:\n" + err.stack);
  };
}

async function executeQuery(requestid,query, params) {
  let result;
  let rows = 0;
  let data = null;
  let score = 0;

  console.log(`executeQuery():\n  Request ID: ${requestid}\n  Query: ${query}`);
  // console.log(`executeQuery():\n  Query: ${query}\n  Params: ${JSON.stringify(params)}`);

  let stTime = Date.now();
  try {
    const client = await pool.connect(); // Get a connection
    // result = (params) ? await client.query(query, [pgvector.toSql(params)]) : await client.query(query);
    result = (params) ? await client.query(query, params) : await client.query(query);
   
    // if ( result.rowCount.length >= 1 ) {
    result.rows.map(row => {
      // console.log(`  Completion: ${JSON.stringify(row)}`);
      score = row.similarity;
      data = row.completion;
      rows++;
    });
    // }
    // else
      // console.log(`  Rows: ${result.rowCount.length}`);
    console.log(`  Operation: ${result.command}\n  Retrieved Rows: ${rows}\n  Similarity Score: ${score}\n  Execution Time: ${Date.now() - stTime}\n*****`);
  
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
  executeQuery
}
