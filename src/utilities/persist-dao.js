/**
 * Name: PersistDao
 * Description: This class serves as a data access object (DAO) for all 
 * entities used by API Gateway - Cache, Prompts, Memory & Tool execution trace.
 *
 * Contains methods to 
 *   1) Query and retrieve persisted entities and 
 *   2) Store entities in the underlying database table
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-01-2024
 * Version: 1.0.0
 *
 * Notes:
 * ID04112024: ganrad: Save completion (OAI Response) and uname (user name) in 'apigtwyprompts' table
 * ID05062024: ganrad: Introduced memory feature (state management) for appType = Azure OpenAI Service
 * ID10262024: ganrad: v2.1.0: (Enhancement) Introduced table aiapptoolstrace to capture tool execution details for multi-domain AI Apps.
 * ID11042024: ganrad: v2.1.0: (Enhancement) Introduced 'apprequests' end-point.  Added method for querying a completion by request and AI app ID.
 * ID11082024: ganrad: v2.1.0: (Enhancement) Added new field 'exec_time_secs' (~ execution time) to the 'apigtwyprompts' table.
 * ID11112024: ganrad: v2.1.0: (Enhancement) Added new field 'srv_name' to cache, memory, prompts and tools trace tables.  This field will allow
 * a) Each server instance to cleanly evict cache/memory entries independently of other instances within a replica set & b) Provide info. on which
 * server instance actually created a record in the respective DB table.
 * ID11122024: ganrad: v2.1.0: (Enhancement) Added DML statements for 'memory' table.  These fields are required for integrating multi-domain with
 * single-domain gateway.
*/

// const pgvector = require('pgvector/pg');

const TblNames = {
    Cache: "Cache",
    Prompts: "Prompts",
    Memory: "Memory", // ID05062024.n
    ToolsTrace: "ToolsTrace" // ID10262024.n
  };

const cacheQueryStmts = [
  "SELECT * FROM apigtwycache ORDER BY timestamp_ DESC",
  "SELECT id, requestid, aiappname, prompt, completion, timestamp_ FROM apigtwycache ORDER BY timestamp_ DESC"
];

const promptQueryStmts = [
  "SELECT * FROM apigtwyprompts ORDER BY timestamp_ DESC",
  "SELECT * FROM apigtwyprompts WHERE requestid = $1 AND aiappname = $2" // ID11042024.n
];

const promptInsertStmts = [
  // "INSERT INTO apigtwyprompts (requestid, aiappname, prompt) VALUES ($1,$2,$3) RETURNING id" ID04112024.o
  // "INSERT INTO apigtwyprompts (requestid, aiappname, prompt, completion, uname) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID04112024.n, ID11082024.o
  "INSERT INTO apigtwyprompts (requestid, srv_name, aiappname, prompt, completion, uname, exec_time_secs) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id" // ID11082024.n, ID11112024.n
];

const memoryQueryStmts = [ // ID05062024.n
  "SELECT * FROM apigtwymemory ORDER BY timestamp_ DESC",
  "SELECT * FROM apigtwymemory WHERE threadid = $1 AND aiappname = $2",
  "SELECT * FROM apigtwymemory WHERE threadid = $1 AND md_aiappname = $2" // AND md_srv_name = $3" // ID11122024.n
];

const memoryInsertStmts = [ // ID05062024.n
  "INSERT INTO apigtwymemory (requestid, srv_name, threadid, aiappname, context, uname) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", // ID05062024.n, ID11112024.n
  // `UPDATE apigtwymemory SET requestid = $1, context = $4, uname = $5, timestamp_ = to_timestamp(${Date.now()} / 1000) WHERE threadid = $2 and aiappname = $3 RETURNING id`
  `UPDATE apigtwymemory SET requestid = $1, context = $5, uname = $6, srv_name = $2 WHERE threadid = $3 and aiappname = $4 RETURNING id`, // ID11112024.n
  `UPDATE apigtwymemory SET tool_name = $3, md_aiappname = $4, md_srv_name = $5 WHERE threadid = $1 and aiappname = $2 RETURNING id` // ID11122024.n
];

const toolsTraceQueryStmts = [ // ID10262024.n
  "SELECT * FROM aiapptoolstrace ORDER BY timestamp_ DESC",
  "SELECT * FROM aiapptoolstrace WHERE requestid = $1 AND aiappname = $2"
];

const toolsTraceInsertStmts = [ // ID10262024.n
  "INSERT INTO aiapptoolstrace (requestid, srv_name, aiappname, uname, tool_trace) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID11112024.n
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
    }
    else if ( this.entity === TblNames.ToolsTrace ) {
      query = toolsTraceQueryStmts[qidx];
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

  async storeEntity(reqid, qidx, values) {
    let query = null;

    if ( this.entity === TblNames.Prompts )
      query = promptInsertStmts[qidx];

    if ( this.entity === TblNames.Memory )
      query = memoryInsertStmts[qidx];

    if ( this.entity === TblNames.ToolsTrace ) // ID10262024.n
      query = toolsTraceInsertStmts[qidx];

    // await this.dbHandle.insertData( // ID05062024.o
    await this.dbHandle.updateData( // ID05062024.n
      reqid, // ID11122024.n
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
