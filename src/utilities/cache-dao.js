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
 *
*/
const pgvector = require('pgvector/pg');
const helper = require("./helper-funcs");

const srchTypes = new Map([ // Vector search types
  ["L2","<->"], // Euclidean or L2 distance
  ["IP","<#>"], // Inner product
  ["CS","<=>"]  // (Default) Cosine similarity
]);

function constructQuery(strings, operator, srchDistance) {
  return `strings[0] ${operator} $1 < ${distance}`;
}

const queryStmts = [
  "SELECT completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE 1 - (embedding <=> $1) > $2 ORDER BY embedding <=> $1 LIMIT $3",
  "SELECT completion, embedding <-> $1 as similarity FROM apigtwycache WHERE embedding <-> $1 < $2 ORDER BY embedding <-> $1 LIMIT $3",
  "SELECT completion FROM apigtwycache ORDER BY embedding" // Requires an index!
];

const insertStmts = [
  "INSERT INTO apigtwycache (requestid, aiappname, prompt, embedding, completion) VALUES ($1,$2,$3,$4,$5) RETURNING id"
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
    this.srchType = (sType) ? sType : "CS"; // Default ~ CS
    this.srchDistance = (sDistance) ? sDistance : 0.6; // Default ~ 0.6
    this.srchTerm = (sContent) ? ( sContent.term ? sContent.term : "prompt" ) : "prompt"; 
    if ( (this.srchTerm !== "prompt") && (this.srchTerm !== "messages") )
      this.srchTerm = "prompt"; // default search term
    this.srchTermRoles = (this.srchTerm === "messages") ? ( sContent.includeRoles ? sContent.includeRoles : "system,user,assistant" ) : null;
  }

  async queryVectorDB(rid, appId, reqBody, dbHandle) {
    let embedding = null;
    let rowno = 0;
    let score = 0.0;
    let data = null;

    let stTime = Date.now();
    try {
      // 1) Pre-process query before vectorization
      let queryContent = helper.prepareTextToEmbedd(
        rid,
        this.srchTerm,
        this.srchTermRoles,
        reqBody);

      // 2) Convert query to embedded vector using Azure OpenAI ADA model
      let apiResp = await helper.callRestApi(
        rid,
        reqBody.user,
        this.endPointInfo,
        this.endpoints,
        queryContent);

      if ( apiResp ) { // Use the embedded vector to query against the Vector DB
        // const query = queryStmts[0] + ` ${srchTypes.get(this.srchType)}` + " $1 < " + `${this.srchDistance}`;
        // const query = queryStmts[1] + ` ${srchTypes.get(this.srchType)}` + " $1 LIMIT 1"
        var query = "";
	if ( this.srchType === "CS" ) // cosine similarity search
	  query = queryStmts[0];
	else if ( this.srchType === "L2" ) // L2 or Euclidean search
	  query = queryStmts[1];
	else if ( this.srchType === "IP" ) // Inner product
	  query = queryStmts[0]; // Not tested yet!
	else
	  query = queryStmts[0]; // Default cosine similarity search

        // 3) Execute vector query on DB
        const {rowCount, simScore, completion} = 
          await dbHandle.executeQuery(
            rid,
            query,
            [
              pgvector.toSql(apiResp.embedding),
              this.srchDistance,
              1
            ]
          );

        rowno = rowCount,
        score = simScore,
        data = completion,
        embedding = apiResp.embedding;
      };
      console.log(`${this.constructor.name}.queryVectorDB():\n  Application ID: ${appId}\n  Request ID: ${rid}\n  User: ${reqBody.user}\n  Execution Time: ${Date.now() - stTime}\n*****`);
    }
    catch (error) {
      let err_msg = {reqId: rid, appId: appId, body: reqBody, cause: error};
      console.log(`*****\nCacheDao.queryVectorDB():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
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

    await dbHandle.insertData(insertStmts[qidx],values);

    console.log(`${this.constructor.name}.storeEntity():\n  Application ID: ${values[1]}\n  Request ID: ${values[0]}\n  Execution Time: ${Date.now() - stTime}\n*****`);
  }
}

module.exports = CacheDao;
