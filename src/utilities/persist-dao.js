/**
 * Name: PersistDao
 * Description: This class serves as a data access object (DAO) for all 
 * entities used by API Gateway - Cache, Prompts, Memory.
 *
 * Contains methods to 
 *   1) Query and retrieve persisted entities and 
 *   2) Store entities in the underlying database table
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 *
 * Notes:
 * ID04112024: ganrad: Save completion (OAI Response) and uname (user name) in 'apigtwyprompts' table
 * ID05062024: ganrad: Introduced memory feature (state management) for appType = Azure OpenAI Service
 *
*/
const pgvector = require('pgvector/pg');

const TblNames = {
    Cache: "Cache",
    Prompts: "Prompts",
    Memory: "Memory" // ID05062024.n
  };

const cacheQueryStmts = [
  "SELECT * FROM apigtwycache ORDER BY timestamp_ DESC",
  "SELECT id, requestid, aiappname, prompt, completion, timestamp_ FROM apigtwycache ORDER BY timestamp_ DESC"
];

const promptQueryStmts = [
  "SELECT * FROM apigtwyprompts ORDER BY timestamp_ DESC"
];

const promptInsertStmts = [
  // "INSERT INTO apigtwyprompts (requestid, aiappname, prompt) VALUES ($1,$2,$3) RETURNING id" ID04112024.o
  "INSERT INTO apigtwyprompts (requestid, aiappname, prompt, completion, uname) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID04112024.n
];

const memoryQueryStmts = [ // ID05062024.n
  "SELECT * FROM apigtwymemory WHERE threadid = $1 AND aiappname = $2"
];

const memoryInsertStmts = [ // ID05062024.n
  "INSERT INTO apigtwymemory (requestid, threadid, aiappname, context, uname) VALUES ($1,$2,$3,$4,$5) RETURNING id", // ID05062024.n
  // `UPDATE apigtwymemory SET requestid = $1, context = $4, uname = $5, timestamp_ = to_timestamp(${Date.now()} / 1000) WHERE threadid = $2 and aiappname = $3 RETURNING id`
  `UPDATE apigtwymemory SET requestid = $1, context = $4, uname = $5 WHERE threadid = $2 and aiappname = $3 RETURNING id`
];

class PersistDao {
  constructor(dbh, tableName) {
    this.dbHandle = dbh;
    this.entity = tableName;
  }

  async queryTable(rid, qidx, params) {
    let query = null;

    if ( this.entity === TblNames.Prompts ) {
      query = promptQueryStmts[qidx];
    }
    else if ( this.entity === TblNames.Cache ) {
      query = cacheQueryStmts[qidx];
    }
    else if ( this.entity === TblNames.Memory ) {
      query = memoryQueryStmts[qidx];
    };

    const {rowCount, completion} = 
      await this.dbHandle.executeQuery(
        this.entity,
        rid,
        query,
        params
      );

    return {
      rCount: rowCount,
      data: completion
    };
  }

  async storeEntity(qidx, values) {
    let query = null;

    if ( this.entity === TblNames.Prompts )
      query = promptInsertStmts[qidx];

    if ( this.entity === TblNames.Memory )
      query = memoryInsertStmts[qidx];

    // await this.dbHandle.insertData( // ID05062024.o
    await this.dbHandle.updateData( // ID05062024.n
      this.entity,
      query,
      values
    );
  }
}

module.exports = {
  TblNames,
  PersistDao
}
