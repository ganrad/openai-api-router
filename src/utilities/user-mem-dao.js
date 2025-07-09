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
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const pgvector = require('pgvector/pg');
const helper = require("./helper-funcs");
const { SearchAlgorithms } = require("./app-gtwy-constants");
const { TblNames, PersistDao } = require("./persist-dao.js"); 
const persistdb = require("../services/pp-pg.js");

class UserMemDao {
  constructor(
    epInfo,
    vectorEndpoints) {

    this.endPointInfo = epInfo;
    this.endpoints = vectorEndpoints;
    this.srchType = SearchAlgorithms.EuclideanDistance; // Default ~ EuclideanDistance
  }

  async queryUserFactsFromDB(req, appId, userInput) {
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
          req.body.user,
          pgvector.toSql(apiResp.embedding)
        ];

        userFacts = await userFactsDao.queryTable(req.id, 1, values);
      };
      logger.log({ level: "info", message: "[%s] %s.queryUserFactsFromDB():\n  Request ID: %s\n  Application ID: %s\n  User: %s\n  Execution Time: %s", splat: [scriptName, this.constructor.name, req.id, appId, req.body.user, Date.now() - stTime] });
    }
    catch (error) {
      let err_msg = { reqId: req.id, appId: appId, body: req.body, cause: error };
      userFacts = {
        rCount: 0,
        data: null,
        errors: err_msg
      };
      logger.log({ level: "error", message: "[%s] %s.queryUserFactsFromDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, err_msg] });
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
          req.body.user,
          userFact,
          pgvector.toSql(apiResp.embedding)
        ];

        const recId = await userFactsDao.storeEntity(req.id, 0, values);
        logger.log({ level: "info", message: "[%s] %s.storeUserFactInDB():\n  Request ID: %s\n  Application ID: %s\n  User: %s\n  Record ID: %d\n  Execution Time: %s", splat: [scriptName, this.constructor.name, req.id, appId, req.body.user, recId?.record_id, Date.now() - stTime] });
      };
    }
    catch (error) {
      let err_msg = { reqId: req.id, appId: appId, body: req.body, cause: error };
      logger.log({ level: "error", message: "[%s] %s.storeUserFactInDB():\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, err_msg] });
    };
  }
}

module.exports = UserMemDao;