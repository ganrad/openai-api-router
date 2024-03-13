/**
 * Name: PersistDao
 * Description: This class serves as a data access object (DAO) for all 
 * entities used by API Gateway - Prompts. Contains methods to 
 *   1) Query and retrieve persisted entities and 
 *   2) Store entities in the underlying database
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 *
 * Notes:
 *
*/
const pgvector = require('pgvector/pg');

const tblNames = {
    cache: "Cache",
    prompts: "Prompts"
  };

const cacheQueryStmts = [
  "SELECT * FROM apigtwycache ORDER BY timestamp_ DESC",
  "SELECT id, requestid, aiappname, prompt, completion, timestamp_ FROM apigtwycache ORDER BY timestamp_ DESC"
];

const promptQueryStmts = [
  "SELECT * FROM apigtwyprompts ORDER BY timestamp_ DESC"
];

const promptInsertStmts = [
  "INSERT INTO apigtwyprompts (requestid, aiappname, prompt) VALUES ($1,$2,$3) RETURNING id"
  ];

class PersistDao {
  constructor(dbh, tableName) {
    this.dbHandle = dbh;
    this.entity = tableName;
  }

  async queryTable(rid, qidx, params) {
    let query = null;

    if ( this.entity === tblNames.prompts ) {
      query = promptQueryStmts[qidx];
    }
    else if ( this.entity === tblNames.cache ) {
      query = cacheQueryStmts[qidx];
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

    if ( this.entity === tblNames.prompts )
      query = promptInsertStmts[qidx];

    await this.dbHandle.insertData(
      this.entity,
      query,
      values
    );
  }
}

module.exports = {
  tblNames,
  PersistDao
}
