/**
 * Name: AI Application Gateway Control Plane
 * Description: A simple control plane that exposes functions for performing CRUD operations on AI App Gateway resources.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-23-2025
 * Version: 2.2.0
 *
 * Notes:
*/

const path = require('path');
const scriptName = path.basename(__filename);

const express = require("express");
const AppResProcessorFactory = require("../ai-app-resources/app-res-processor-factory.js");
const logger = require("../utilities/logger.js");
const cprouter = express.Router();

// Endpoint: /apirouter/cp/:resource_type/:action[/:resource_id]
// Method(s): GET, POST, DELETE
// Resources: AiAppServer, AiApplication, MdAiApplication, RagAiApplication
// Actions: operations, deploy, status, get, delete
cprouter.use(["/cp/:res_type/:res_id/:action", "/cp/:res_type/:action"], async (req, res) => {
  const resourceType = req.params.res_type; // AI Gateway resource type
  const action = req.params.action; // Action to be performed on resource
  logger.log({ level: "info", message: "[%s] cprouter():\n  Request ID: %s\n  Resource Type: %s\n  Action: %s", splat: [scriptName, req.id, resourceType, action] });

  let response;
  if (!resourceType || !action) {
    response = {
      http_code: 400, // Bad Request
      data: {
        endpointUri: req.originalUrl,
        message: `Resource Type [${resourceType}] and Action [${action}] are required parameters! Unable to process request.`,
        code: "invalidPayload"
      }
    };
  }
  else { 
    try {
      response = await processRequest(req);
    }
    catch (error) { // catch all exceptions!
      logger.log({ level: "warn", message: "[%s] cprouter():\n  Request ID: %s\n  Encountered exception: %s", splat: [scriptName, req.id, error.stack] });
      
      response = {
        http_code: 500, // Internal Server Error
        data: {
          endpointUri: req.originalUrl,
          message: `AI Services Gateway encountered exception: [${error}].`,
          code: "internalServerFailure"
        }
      };
    };
  };

  res.status(response.http_code).json(response.data);
});

async function processRequest(req) {
  let respMessage;
  
  let resourceProcessor = new AppResProcessorFactory().getResourceProcessor(req.params.res_type);
  if ( resourceProcessor )
    respMessage = await resourceProcessor.executeOperation(req);
  else {
    respMessage = {
      http_code: 400, // Bad Request
      data: {
        endpointUri: req.originalUrl,
        message: `Resource Type [${resourceType}] is invalid! Unable to process request.`,
        code: "invalidPayload"
      }
    };
  };
  
  return respMessage;
}

module.exports = cprouter;