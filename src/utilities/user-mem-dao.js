/**
 * Name: UserMemDao
 * Description: This class serves as a data access object (DAO) for
 * long term user memory (Semantic/Vector) store. Contains methods to 
 *   1) Query and retrieve user facts and 
 *   2) Store entries in the long term memory DB
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 06-02-2025
 * Version (Introduced): v2.3.8
 *
 * Notes:
 * ID10202025: ganrad: v2.8.0: (Enhancement) Updated long term memory feature to support multiple user groups.
 * ID12012025: ganrad: v2.9.5: (Optimize) Updated search type/algorithm constants to a uniform set of values.
 * ID12042025: ganrad: v2.9.5: (Refactored code) Log error message details.
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const pgvector = require('pgvector/pg');
const helper = require("./helper-funcs");
const {
  SearchAlgorithms,
  LongTermMemoryTypes,
  LongTermMemoryConstants } = require("./app-gtwy-constants"); // ID10202025.n
const { TblNames, PersistDao } = require("./persist-dao.js"); 
const persistdb = require("../services/pp-pg.js");
const { formatException } = require("./helper-funcs.js");

class UserMemDao {
  constructor(
    epInfo,
    vectorEndpoints) {

    this.endPointInfo = epInfo;
    this.endpoints = vectorEndpoints;
  }

  async queryUserFactsFromDB(req, appId, srchAlg, userInput) { // ID10202025.n
    const srvId = process.env.API_GATEWAY_ID;

    let userFacts;
    let stTime = Date.now();
    try {
      // 0) Check if embedd model endpoints are available. If not exit function.
      if ( ! this.endpoints ) {
        let err_msg = {
          reqId: req.id,
          appId: appId,
          body: req.body,
          cause: "No endpoints available for embedding model. Aborting process ..."
        };
        userFacts = {
          rCount: 0,
          data: null,
          errors: err_msg
        };
        logger.log({ level: "error", message: "[%s] %s.queryUserFactsFromDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, err_msg] });
        return userFacts;
      };

      // 2) Convert user input to embedded vector using Azure OpenAI ADA model
      let apiResp = await helper.vectorizeQuery(
        req, 
        this.endPointInfo,
        this.endpoints,
        userInput);

      let userFactsDao;
      let values;
      // 3) Execute vector match query on user facts table
      if (apiResp) { // Use the embedded vector to query against the user facts store/DB
        userFactsDao = new PersistDao(persistdb, TblNames.UserFacts);
        values = [
          srvId,
          appId,
          // req.body.user, ID10202025.o
          req.group ?? req.user, // ID10202025.n
          pgvector.toSql(apiResp.embedding),
          LongTermMemoryConstants.NoOfRows // ID10202025.n
        ];
        // if ( srchAlg === SearchAlgorithms.CosineSimilarity ) // ID10202025.n, ID12012025.o
        if ( srchAlg === SearchAlgorithms.Cosine ) // ID12012025.n
          values.push(LongTermMemoryConstants.SearchDistance);  // Add the search distance

        // userFacts = await userFactsDao.queryTable(req.id, (srchAlg === SearchAlgorithms.CosineSimilarity) ? 2 : 1, values); ID12012025.o
        userFacts = await userFactsDao.queryTable(req.id, (srchAlg === SearchAlgorithms.Cosine) ? 2 : 1, values); // ID12012025.n
      };
      const searchBy = req.group ? LongTermMemoryTypes.GroupType : LongTermMemoryTypes.UserType; // ID10202025.n
      logger.log({ level: "info", message: "[%s] %s.queryUserFactsFromDB():\n  Request ID: %s\n  Application ID: %s\n  %s: %s\n  Search Alg.: %s\n  Execution Time: %s", splat: [scriptName, this.constructor.name, req.id, appId, searchBy, req.group ?? req.user, srchAlg, Date.now() - stTime] });
    }
    catch (error) {
      let err_msg = { reqId: req.id, appId: appId, body: req.body, cause: error };
      userFacts = {
        rCount: 0,
        data: null,
        errors: err_msg
      };
      logger.log({ level: "error", message: "[%s] %s.queryUserFactsFromDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, formatException(err_msg)] });
    };

    return userFacts;
  }

  async storeUserFactInDB(req, appId, userFact) {
    let stTime = Date.now();
    const srvId = process.env.API_GATEWAY_ID;

    try {
      // 0) Check if embedd model endpoints are available. If not exit function.
      if ( ! this.endpoints ) {
        let err_msg = {
          reqId: req.id,
          appId: appId,
          body: userFact,
          cause: "No endpoints available for embedding model. Aborting process ..."
        };
        logger.log({ level: "error", message: "[%s] %s.storeUserFactInDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, err_msg] });
        return;
      };

      // 2) Convert user fact to embedded vector using Azure OpenAI ADA model
      let apiResp = await helper.vectorizeQuery(
        req, 
        this.endPointInfo,
        this.endpoints,
        userFact);

      let userFactsDao;
      let values;
      // 3) Insert fact in user facts table
      if (apiResp) {
        userFactsDao = new PersistDao(persistdb, TblNames.UserFacts);
        values = [
          srvId,
          appId,
          // req.body.user, ID10202025.o
          req.group ?? req.user, // ID10202025.n
          userFact,
          pgvector.toSql(apiResp.embedding)
        ];

        const recId = await userFactsDao.storeEntity(req.id, 0, values);
        const storeBy = req.group ? LongTermMemoryTypes.GroupType : LongTermMemoryTypes.UserType; // ID10202025.n
        logger.log({ level: "info", message: "[%s] %s.storeUserFactInDB():\n  Request ID: %s\n  Application ID: %s\n  %s: %s\n  Record ID: %d\n  Execution Time: %s", splat: [scriptName, this.constructor.name, req.id, appId, storeBy, req.group ?? req.user, recId?.record_id, Date.now() - stTime] });
      };
    }
    catch (error) {
      let err_msg = { reqId: req.id, appId: appId, body: req.body, cause: error };
      logger.log({ level: "error", message: "[%s] %s.storeUserFactInDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, formatException(err_msg)] });
    };
  }
}

module.exports = UserMemDao;