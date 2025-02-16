/**
 * Name: RAG Application Resource Processor
 * Description: This class implements the CRUD operations for a RAG Application resource.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-23-2025
 * Version: 2.2.0
 *
 * Notes:
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("../utilities/logger.js");

const persistdb = require("../services/pp-pg.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const { HttpMethods, AppResourceTypes, DocProcessorStatus, AppResourceActions } = require("../utilities/app-gtwy-constants.js");
const { randomUUID } = require('node:crypto');
// const http = require('node:http');

class RagAppProcessor {

  constructor() {
  }

  async executeOperation(req) {
    let respMessage;
    let action = req.params.action;
    if ( action === AppResourceActions.Deploy )
      respMessage = await this.#deployApplication(req);
    else if ( action === AppResourceActions.Status )
      respMessage = await this.#checkAppDeploymentStatus(req);
    else {
      respMessage = {
        http_code: 400,
        data: {
          error: {
            endpointUri: req.originalUrl,
            message: `Resource Type [${AppResourceTypes.RagApplication}] does not support Action [${action}]! Unable to process request.`,
            code: "invalidPayload"
          }
        }
      };
    };

    return(respMessage);
  }

  async #checkAppDeploymentStatus(req) {
    if ( req.method !== HttpMethods.GET )
      return {
        http_code: 405, // Method not allowed
        data: {
          error: {
            endpointUri: req.originalUrl,
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${req.params.res_type}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };
    
    const jobId = req.params.res_id;
    if ( ! jobId )
      return {
        http_code: 400, // Bad Request
        data: {
          endpointUri: req.originalUrl,
          message: `Application deployment Job ID=[${jobId}] is invalid! Unable to process request.`,
          code: "invalidPayload"
        }
      };

    let respMessage;
    let aiAppsDao = new PersistDao(persistdb, TblNames.AiAppDeploy);
    let values = [ jobId ];
    const jobdata = await aiAppsDao.queryTable(req.id, 2, values); // Retrieve the app deployment (job) request data
    if ( jobdata.rCount === 1 ) {
      respMessage = {
        http_code: 200, // OK
        data : jobdata.data[0]
      };
    }
    else
      respMessage = {
        http_code: 404, // Resource (Job) not found in DB
        data: {
          endpointUri: req.originalUrl,
          message: `Application deployment Job ID=[${jobId}] not found! Unable to process request.`,
          code: "invalidPayload"
        }
      };

    return(respMessage);
  }

  async #deployApplication(req) {
    if ( req.method !== HttpMethods.POST )
      return {
        http_code: 405, // Method not allowed
        data: {
          error: {
            endpointUri: req.originalUrl,
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${req.params.res_type}: ${req.body.aiappname}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };

    const jobId = randomUUID();

    let aiAppsDao = new PersistDao(persistdb, TblNames.AiAppDeploy);
    let values = [
      jobId,
      req.body.rapid_uri,
      req.body.srv_name,
      req.body.aiappname,
      req.id,
      req.body.payload,
      req.body.doc_processor_type,
      DocProcessorStatus.Created,
      req.body.user
    ];
  
    const dbresp = await aiAppsDao.storeEntity( // Store the app deployment request / job
      req.id,
      0,
      values);
  
    let respMessage;
    if ( dbresp.record_id > 0 ) {
      // values = [ dbresp.record_id ];
      // const jobs = await aiAppsDao.queryTable(req.id, 1, values); // Retrieve the job id
      // if ( jobs.rCount === 1 ) {
      respMessage = {
        http_code: 201, // Record created
        data : {
          requestId: req.id,
          endpointUri: req.originalUrl,
          jobId: jobId,
          aiAppName: req.body.aiappname,
          createDate: new Date().toLocaleString(),
          status: DocProcessorStatus.Created
        }
        // };
      };
    }
    else {
      respMessage = {
        http_code: 500,  // Internal server error
        data: {
          error: {
            endpointUri: req.originalUrl,
            message: `Action [${action}] on resource type [${resourceType}: ${req.body.aiappname}] failed.  Check server logs.`,
            code: "internalServerError"
          }
        }
      };
    };

    return(respMessage);
  }
} // end of class

module.exports = RagAppProcessor;