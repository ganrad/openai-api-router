/**
 * Name: CacheDao
 * Description: This class serves as a data access object (DAO) to the 
 * underlying cache (Semantic/Vector) DB. Contains methods to 
 *   1) Query and retrieve cached entries and 
 *   2) Store entries in the cache DB
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-20-2024
 *
 * Notes:
 * ID04112024: ganrad: Match AI app name/id when selecting cached entries
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID11072024: ganrad: v2.1.0: (Optimize) Moved literal constants into 'app-gtwy-constants.js' file
 * ID11112024: ganrad: v2.1.0: (Enhancement) Added new field 'srv_name' to cache, memory, prompts and tools trace tables.  This field will allow
 * a) Each server instance to cleanly evict cache/memory entries independently of other instances within a replica set & b) Provide info. on which
 * server instance actually created a record in the respective DB table.
 * ID01292025: ganrad: v2.2.0: (Bugfix) Gracefully skip caching when embedding application and endpoints are not configured.
 * ID03052025: ganrad: v2.3.0: (Bugfix) Use MID auth for Azure AI Service(s) when it is enabled & configured for the runtime.
 * ID09032025: ganrad: v2.5.0: (Code refactoring) Optimized query to retrieve vectorized prompt.
 * ID09122025: ganrad: v2.5.0: (Enhancement) When querying the cache, search for a similar prompt in server instance(s) whose names start with the
 * server id and AI application id.
 *   
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const pgvector = require('pgvector/pg');
const helper = require("./helper-funcs");
const { SearchAlgorithms } = require("./app-gtwy-constants"); // ID11072024.n

const srchTypes = new Map([ // Vector search types
  [SearchAlgorithms.EuclideanDistance, "<->"], // Euclidean or L2 distance ID11072024.n
  [SearchAlgorithms.InnerProduct, "<#>"], // Inner product
  [SearchAlgorithms.CosineSimilarity, "<=>"]  // (Default) Cosine similarity
]);

function constructQuery(strings, operator, srchDistance) {
  return `strings[0] ${operator} $1 < ${distance}`;
}

const queryStmts = [
  // "SELECT completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE 1 - (embedding <=> $1) > $2 ORDER BY embedding <=> $1 LIMIT $3", ID04112024.o
  // Cosine similarity search
  // "SELECT completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE (aiappname = $4) AND (1 - (embedding <=> $1) > $2) ORDER BY embedding <=> $1 LIMIT $3", // ID04112024.n, ID09032025.o
  "SELECT completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE (srv_name LIKE $5 || '%') AND (aiappname = $4) AND 1 - (embedding <=> $1) >= $2 ORDER BY similarity DESC LIMIT $3", // ID09032025.n, ID09122025.n
  // "SELECT completion, embedding <-> $1 as similarity FROM apigtwycache WHERE embedding <-> $1 < $2 ORDER BY embedding <-> $1 LIMIT $3", ID04112024.o
  // Euclidean or L2 search
  "SELECT completion, embedding <-> $1 as similarity FROM apigtwycache WHERE (aiappname = $4) AND (embedding <-> $1 < $2) ORDER BY embedding <-> $1 LIMIT $3", // ID04112024.n
  "SELECT completion FROM apigtwycache ORDER BY embedding" // Requires an index!
];

const insertStmts = [
  // "INSERT INTO apigtwycache (requestid, aiappname, prompt, embedding, completion) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID11112024.o
  "INSERT INTO apigtwycache (requestid, srv_name, aiappname, prompt, embedding, completion) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id" // ID11112024.n
];

class CacheDao {
  constructor(
    epInfo,
    vectorEndpoints,
    sType,
    sDistance,
    sContent) {

    this.endPointInfo = epInfo;
    this.endpoints = vectorEndpoints;
    this.srchType = (sType) ? sType : SearchAlgorithms.CosineSimilarity; // Default ~ Cosine Similarity ID11072024.n
    this.srchDistance = (sDistance) ? sDistance : 0.6; // Default ~ 0.6
    this.srchTerm = (sContent) ? (sContent.term ? sContent.term : "prompt") : "prompt";
    if ((this.srchTerm !== "prompt") && (this.srchTerm !== "messages"))
      this.srchTerm = "prompt"; // default search term
    this.srchTermRoles = (this.srchTerm === "messages") ? (sContent.includeRoles ? sContent.includeRoles : "system,user,assistant") : null;
  }

  // async queryVectorDB(rid, appId, reqBody, dbHandle) { ID03052025.o
  async queryVectorDB(req, appId, dbHandle) { // ID03052025.n
    let embedding = null;
    let rowno = 0;
    let score = 0.0;
    let data = null;

    let stTime = Date.now();
    try {
      // 0) Check if embedd model endpoints are available. If not exit function.
      if ( ! this.endpoints ) // ID01292025.n
        return {
          rowCount: rowno,
          simScore: score,
          completion: data,
          embeddings: embedding
        };

      // 1) Pre-process query before vectorization
      let queryContent = helper.prepareTextToEmbedd(
        // rid, // ID03052025.o
        req.id, // ID03052025.n
        this.srchTerm,
        this.srchTermRoles,
        // reqBody); ID03052025.o
        req.body); // ID03052025.n

      // 2) Convert query to embedded vector using Azure OpenAI ADA model
      // let apiResp = await helper.callRestApi( ID03052025.o
      let apiResp = await helper.vectorizeQuery( // ID03052025.n
        // rid, ID03052025.n
        req, // ID0305205.n
        // reqBody.user, ID03052025.o
        this.endPointInfo,
        this.endpoints,
        queryContent);

      if (apiResp) { // Use the embedded vector to query against the Vector DB
        // const query = queryStmts[0] + ` ${srchTypes.get(this.srchType)}` + " $1 < " + `${this.srchDistance}`;
        // const query = queryStmts[1] + ` ${srchTypes.get(this.srchType)}` + " $1 LIMIT 1"
        let query = "";
        if (this.srchType === SearchAlgorithms.CosineSimilarity) // cosine similarity search ID11072024.n
          query = queryStmts[0];
        else if (this.srchType === SearchAlgorithms.EuclideanDistance) // L2 or Euclidean search
          query = queryStmts[1];
        else if (this.srchType === SearchAlgorithms.InnerProduct) // Inner product, set to cosine similarity
          query = queryStmts[0]; // Not supported / tested yet!
        else
          query = queryStmts[0]; // Default cosine similarity search

        // 3) Execute vector query on DB
        const { rowCount, simScore, completion } =
          await dbHandle.executeQuery(
            // rid, ID03052025.o
            req.id, // ID03052025.n
            query,
            [
              pgvector.toSql(apiResp.embedding),
              this.srchDistance,
              1,
              appId, // ID04112024.n
              req.targeturis.serverId // ID09122025.n
            ]
          );

        rowno = rowCount,
        score = simScore,
        data = completion,
        embedding = apiResp.embedding;
      };
      // console.log(`${this.constructor.name}.queryVectorDB():\n  Application ID: ${appId}\n  Request ID: ${rid}\n  User: ${reqBody.user}\n  Execution Time: ${Date.now() - stTime}\n*****`);
      logger.log({ level: "info", message: "[%s] %s.queryVectorDB():\n  Application ID: %s\n  Request ID: %s\n  User: %s\n  Execution Time: %s", splat: [scriptName, this.constructor.name, appId, req.id, req.body.user, Date.now() - stTime] }); // ID03052025.n
    }
    catch (error) {
      let err_msg = { reqId: req.id, appId: appId, body: req.body, cause: error }; // ID03052025.n
      // console.log({level: "error", message: "[%s] %s.queryVectorDB():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
      logger.log({ level: "error", message: "[%s] %s.queryVectorDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, err_msg] });
    };

    return {
      rowCount: rowno,
      simScore: score,
      completion: data,
      embeddings: embedding
    };
  }

  async storeEntity(qidx, values, dbHandle) {
    let stTime = Date.now();

    await dbHandle.insertData(insertStmts[qidx], values);

    // console.log(`${this.constructor.name}.storeEntity():\n  Application ID: ${values[1]}\n  Request ID: ${values[0]}\n  Execution Time: ${Date.now() - stTime}\n*****`);
    logger.log({ level: "info", message: "[%s] %s.storeEntity():\n  Application ID: %s\n  Request ID: %s\n  Execution Time: %d", splat: [scriptName, this.constructor.name, values[2], values[0], Date.now() - stTime] });
  }
}

module.exports = CacheDao;