/**
 * Name: PersistDao
 * Description: This class serves as a data access object (DAO) for all 
 * entities used by AI Application Server/Gateway - App Servers, App Deployment requests, Cache, 
 * Prompts, Memory & Tool execution trace.
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
 * ID01232025: ganrad: v2.2.0: Introduced table 'aiappdeploy' to store new AI Application deployment (RAG) requests.
 * ID01272025: ganrad: v2.2.0: (Enhancement) Introduced table 'aiappservers' to store AI Gateway info. and application configurations.
 * ID02092025: ganrad: v2.2.0: (Enhancement) Return db errors.
 * ID02112025: ganrad: v2.2.0: (Enhancement) Store AOAI response headers in 'apigtwyprompts' table.
 * ID02142025: ganrad: v2.2.0: (Enhancement) Store user session (thread id) in 'apigtwyprompts' table.
 * ID05082025: ganrad: v2.3.5: (Enhancement) Store backend uri id/index which served an inference request in 'apigtwyprompts' table.  Store & attempt
 * to use the same backend uri index for all inferencing requests issued from a given thread (~ to leverage prompt caching).
 * ID05142025: ganrad: v2.3.8: (Enhancement) Introduced table 'userfacts' for long term memory support ~ personalization feature.
 * ID08052025: ganrad: v2.4.0: (Enhancement) Added new insert statement to support AI Agent message persistence in 'apigtwyprompts' table.
*/

// const pgvector = require('pgvector/pg');

const TblNames = {
    Cache: "Cache",
    Prompts: "Prompts",
    Memory: "Memory", // ID05062024.n
    ToolsTrace: "ToolsTrace", // ID10262024.n
    AiAppDeploy: "AiAppDeploy", // ID01232025.n
    AiAppServers: "AiAppServers", // ID01272025.n
    UserFacts: "UserFacts" // ID05142025.n
  };

const cacheQueryStmts = [
  "SELECT * FROM apigtwycache ORDER BY timestamp_ DESC",
  "SELECT id, requestid, aiappname, prompt, completion, timestamp_ FROM apigtwycache ORDER BY timestamp_ DESC"
];

const promptQueryStmts = [
  "SELECT * FROM apigtwyprompts ORDER BY timestamp_ DESC",
  "SELECT * FROM apigtwyprompts WHERE requestid = $1 AND aiappname = $2", // ID11042024.n
  "SELECT * FROM apigtwyprompts WHERE threadid = $1 AND aiappname = $2 ORDER BY id" // ID02142025.n, ID05082025.n
];

const promptInsertStmts = [
  // "INSERT INTO apigtwyprompts (requestid, aiappname, prompt) VALUES ($1,$2,$3) RETURNING id" ID04112024.o
  // "INSERT INTO apigtwyprompts (requestid, aiappname, prompt, completion, uname) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID04112024.n, ID11082024.o
  // "INSERT INTO apigtwyprompts (requestid, srv_name, aiappname, prompt, completion, model_res_hdrs, uname, exec_time_secs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", // ID11082024.n, ID11112024.n, ID02112025.n, ID05082025.o
  "INSERT INTO apigtwyprompts (requestid, srv_name, aiappname, prompt, completion, model_res_hdrs, uname, exec_time_secs, endpoint_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", // ID11082024.n, ID11112024.n, ID02112025.n, ID05082025.n
  "UPDATE apigtwyprompts SET threadid = $4 WHERE requestid = $1 and srv_name = $2 and aiappname = $3 RETURNING id", // ID02142025.n
  "INSERT INTO apigtwyprompts (threadid, requestid, srv_name, aiappname, prompt, completion, uname, exec_time_secs, endpoint_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id" // ID08052025.n
];

const memoryQueryStmts = [ // ID05062024.n
  "SELECT * FROM apigtwymemory ORDER BY timestamp_ DESC",
  "SELECT * FROM apigtwymemory WHERE threadid = $1 AND aiappname = $2",
  "SELECT * FROM apigtwymemory WHERE threadid = $1 AND md_aiappname = $2" // AND md_srv_name = $3" // ID11122024.n
];

const memoryInsertStmts = [ // ID05062024.n
  "INSERT INTO apigtwymemory (requestid, srv_name, threadid, aiappname, context, uname, endpoint_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", // ID05062024.n, ID11112024.n, ID05082025.n
  // `UPDATE apigtwymemory SET requestid = $1, context = $4, uname = $5, timestamp_ = to_timestamp(${Date.now()} / 1000) WHERE threadid = $2 and aiappname = $3 RETURNING id`
  `UPDATE apigtwymemory SET requestid = $1, context = $5, uname = $6, srv_name = $2, endpoint_id = $7 WHERE threadid = $3 and aiappname = $4 RETURNING id`, // ID11112024.n, ID05082025.n
  `UPDATE apigtwymemory SET tool_name = $3, md_aiappname = $4, md_srv_name = $5 WHERE threadid = $1 and aiappname = $2 RETURNING id` // ID11122024.n
];

const toolsTraceQueryStmts = [ // ID10262024.n
  "SELECT * FROM aiapptoolstrace ORDER BY timestamp_ DESC",
  "SELECT * FROM aiapptoolstrace WHERE requestid = $1 AND aiappname = $2"
];

const toolsTraceInsertStmts = [ // ID10262024.n
  "INSERT INTO aiapptoolstrace (requestid, srv_name, aiappname, uname, tool_trace) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID11112024.n
];

const aiAppDeployQueryStmts = [ // ID01232025.n
  "SELECT * FROM aiappdeploy ORDER BY create_date DESC",
  "SELECT job_id FROM aiappdeploy WHERE id = $1",
  "SELECT rapid_uri, srv_name, aiappname, doc_processor_type, status, failed_reason, no_of_runs, process_time, deploy_time, create_date, update_date FROM aiappdeploy WHERE job_id = $1"
];

const aiAppDeployInsertStmts = [ // ID01232025.n
  "INSERT INTO aiappdeploy (job_id, rapid_uri, srv_name, aiappname, requestid, payload, doc_processor_type, status, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id"
];

const aiAppServersQueryStmts = [ // ID01272025.n
  "SELECT * FROM aiappservers ORDER BY create_date DESC",
  "SELECT * FROM aiappservers WHERE srv_name = $1"
];

const aiAppServersInsertStmts = [ // ID01272025.n
  "INSERT INTO aiappservers (srv_name, srv_type, def_gateway_uri, app_conf, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id", // 0
  "UPDATE aiappservers SET def_gateway_uri = $2, app_conf = $3, update_date = NOW() WHERE srv_name = $1 RETURNING id", // 1
  "UPDATE aiappservers SET status = $2, last_stop_time = NOW() WHERE srv_name = $1 RETURNING id", // 2
  "UPDATE aiappservers SET status = $2, start_time = $3 WHERE srv_name = $1 RETURNING id", //3 
  "DELETE FROM aiappservers WHERE srv_name = $1 RETURNING id", // 4
  "UPDATE aiappservers SET app_conf = $2, update_date = NOW() WHERE srv_name = $1 RETURNING id" // 5
];

const userFactsQueryStmts = [ // ID05142025.n
  "SELECT * FROM userfacts ORDER BY create_date DESC",
  "SELECT content FROM userfacts WHERE srv_name = $1 AND aiappname = $2 AND user_id = $3 ORDER BY embedding <-> $4 LIMIT 5"
];

const userFactsInsertStmts = [ // ID05142025.n
  "INSERT INTO userfacts (srv_name, aiappname, user_id, content, embedding) VALUES ($1,$2,$3,$4,$5) RETURNING id"
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
    }
    else if ( this.entity === TblNames.AiAppDeploy ) { // ID01232025.n
      query = aiAppDeployQueryStmts[qidx];
    }
    else if ( this.entity === TblNames.AiAppServers ) { // ID01272025.n
      query = aiAppServersQueryStmts[qidx];
    }
    else if ( this.entity === TblNames.UserFacts ) { // ID05142025.n
      query = userFactsQueryStmts[qidx];
    };

    const {rowCount, completion, errors} = // ID02092025.n
      await this.dbHandle.executeQuery(
        this.entity,
        rid,
        query,
        params
      );

    return {
      rCount: rowCount,
      data: completion,
      errors: errors // ID02092025.n
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

    if ( this.entity === TblNames.AiAppDeploy ) // ID01232025.n
      query = aiAppDeployInsertStmts[qidx];

    if ( this.entity === TblNames.AiAppServers ) // ID01272025.n
      query = aiAppServersInsertStmts[qidx];

    if ( this.entity === TblNames.UserFacts ) // ID05142025.n
      query = userFactsInsertStmts[qidx];

    // await this.dbHandle.insertData( // ID05062024.o
    const result = await this.dbHandle.updateData( // ID05062024.n, ID01232025.n
      reqid, // ID11122024.n
      this.entity,
      query,
      values
    );

    return(result); // ID01232025.n
  }
}

module.exports = {
  TblNames,
  PersistDao
}