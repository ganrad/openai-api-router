const env = process.env;

const pgConfig = {
  db: { /* Do not put password or any sensitive info here! */
    host: env.VECTOR_DB_HOST,
    port: env.VECTOR_DB_PORT,
    user: env.VECTOR_DB_USER,
    password: env.VECTOR_DB_UPWD,
    database: env.VECTOR_DB_NAME,
    ssl: true
  }
};

module.exports = pgConfig;
