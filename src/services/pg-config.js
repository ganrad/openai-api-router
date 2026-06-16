/**
 * Name: PostgreSQL connection configuration
 * Description: This script is used to set the PostgreSQL connection parameters.  Adjust the timeout configuration values
 * as needed.  Adjust the pool size (default is 10 connections) as needed.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 * Version: 1.0.0
 *
 * Notes:
 * ID05272026: ganrad: v3.0.1: (Enhancement) Production hardening. Added new config parameters for connection, query and statement timeout, 
 * pool size and idle timeout.
*/

const env = process.env;

const pgConfig = {
  db: { /* Do not put password or any sensitive info here! */
    host: env.VECTOR_DB_HOST,
    port: env.VECTOR_DB_PORT,
    user: env.VECTOR_DB_USER,
    password: env.VECTOR_DB_UPWD,
    database: env.VECTOR_DB_NAME,
    ssl: true,

    // --- TIMEOUT CONFIGURATIONS --- // ID05222026.n
    // Wait up to 30 seconds to connect before timing out (Default is 0 / infinity)
    connectionTimeoutMillis: env.VECTOR_DB_TIMEOUT || 30000, 
    
    // Wait up to 30 seconds for a query to return data before cutting it off
    query_timeout: env.VECTOR_DB_QUERY_TIMEOUT || 30000,           

    // Tell Postgres server to abort any query taking longer than 30 seconds
    statement_timeout: env.VECTOR_DB_STMT_TIMEOUT || 30000,       

    // --- POOL SIZE CONFIGURATIONS ---
    max: env.VECTOR_DB_CONN_POOL_SIZE || 25, // Maximum number of clients in the pool
    idleTimeoutMillis: env.VECTOR_DB_IDLE_TIMEOUT || 30000 // How long a client is allowed to remain idle before being closed
  }
};

module.exports = pgConfig;
