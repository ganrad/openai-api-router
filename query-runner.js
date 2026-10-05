const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

// Initialize the express app
const app = express();

app.use(bodyParser.json());

const pool = new Pool({
  user: "gradmin",
  host: "gr-apig-dev-pg.postgres.database.azure.com",
  database: "aoaisvc",
  password: "Gbb-2024",
  ssl: true,
  port: 5432,
});

app.post('/run-sql', async (req, res) =>
{

  const query = req.body.messages[0].content;
  console.log(`Begin request.\n  Query:\n${query}`);

  try {
    const result = await pool.query(query);
    console.log(`Query results:\n${JSON.stringify(result.rows,null,2)}`);

    res.json(result.rows);
    // res.send("All Good!");
  } catch (err) {
    console.error('Error executing query', err);
    res.status(500).json({error: 'Error executing query'});
  };
  console.log("End request");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SQL engine is listening on port ${PORT}`);
});
