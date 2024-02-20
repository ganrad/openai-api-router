const pg = require('pg');
const pgConfig = require('./pg-config');

const pool = new pg.Pool(pgConfig.db);

async function dropTable() {
  let query = `DROP TABLE IF EXISTS apigtwycache;`;

  try {
    const client = await pool.connect(); // Get a connection
    await client.query(query);
    console.log('dropTable(): Table dropped successfully!');

    client.release();
  }
  catch (err) {
    console.log("dropTable(): Encountered exception: " + err);
  };
}

async function createTable() {
  // let query = `CREATE TABLE apigtwycache (id serial PRIMARY KEY, aiappname VARCHAR(100), prompt text, embedding vector(3), completion JSON, timestamp_ TIMESTAMPTZ default current_timestamp);`;
  let query = `CREATE TABLE apigtwycache (id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, aiappname VARCHAR(100), prompt text, embedding vector(3), completion JSON, timestamp_ TIMESTAMP default current_timestamp);`;

  try {
    const client = await pool.connect(); // Get a connection
    await client.query(query)
    console.log('createTable(): Table created successfully!');

    client.release();
  }
  catch (err) {
    console.log("createTable(): Encountered exception: " + err);
  };
}

async function insertData(query, params) {
  try {
    const client = await pool.connect();
    const res = await client.query(query,params)
    console.log(`Inserted recs=[${res.rowCount}]; rowid=[${res.rows[0].id}] into table successfully!`);

    client.release();
  }
  catch (err) {
    console.log("insertData(): Encountered exception: " + err);
  };
}

async function executeQuery(query, params) {
  try {
    const client = await pool.connect(); // Get a connection
    const { rows } = (params) ? await client.query(query,params) : await client.query(query);
    rows.map(row => {
      console.log(`executeQuery(): Read: ${JSON.stringify(row)}`);
    });

    client.release();
  }
  catch (err) {
    console.log("insertData(): Encountered exception: " + err);
  };
}

module.exports = {
  dropTable,
  createTable,
  insertData,
  executeQuery
}
