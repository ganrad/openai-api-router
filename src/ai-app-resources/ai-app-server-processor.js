/**
 * Name: AI Application Server Processor
 * Description: This class implements the CRUD operations for an AI Application Server resource.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-28-2025
 * Version: 2.2.0
 *
 * Notes:
*/

const fs = require("fs");
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("../utilities/logger.js");

const persistdb = require("../services/pp-pg.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const {
  DefaultAiGatewayUri,
  ServerTypes, 
  HttpMethods, 
  AppResourceTypes, 
  AppResourceActions, 
  ResourceDBActions, 
  ConfigProviderType } = require("../utilities/app-gtwy-constants.js");
const { 
  validateAiServerSchema,
  sdAiAppSchema, 
  singleDomainAgentSchema,
  mdAiAppSchema, 
  multiDomainAgentSchema } = require("../schemas/validate-json-config.js");
const { reconfigEndpoints } = require("../routes/apirouter.js");
const { reconfigAppMetrics } = require("../routes/md-apirouter.js");

class AiAppServerProcessor {

  constructor() {
  }

  async executeOperation(req) {
    let respMessage;
    let action = req.params.action;
    if ( action === AppResourceActions.Operation )
      respMessage = this.#getResourceOperations(req);
    else if ( action === AppResourceActions.Get )
      respMessage = await this.#getAppServerDetails(req);
    else if ( action == AppResourceActions.Deploy )
      respMessage = await this.#deployAiApps(req);
    else {
      respMessage = {
        http_code: 400, // Bad Request
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Resource Type [${AppResourceTypes.AiAppServer}] does not support Action [${action}]! Unable to process request.`,
            code: "invalidPayload"
          }
        }
      };
    };

    return(respMessage);
  }

  #getResourceOperations(req) {
    let serverDef = req.srvconf;
    const serverName = serverDef.serverId;
    const serverType = serverDef.serverType;

    if ( req.method !== HttpMethods.GET )
      return {
        http_code: 405, // Method not allowed
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${req.params.res_type}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };

    let respMessage = {
      http_code: 200, // OK
      data : {
        requestId: req.id,
        endpointUri: req.originalUrl,
        serverId: serverName,
        serverType: serverType,
        resourceType: AppResourceTypes.AiAppServer,
        operations: {
          operations: {
            uri: "/cp/AiAppServer/operations",
            description: "Get operations supported by this AI resource"
          },
          get: {
            uri: "/cp/AiAppServer/{ai-app-server-id}/get",
            description: "Get details of an AI Application Server by ID"
          },
          deploy: {
            uri: "/cp/AiAppServer/{ai-app-server-id}/deploy",
            description: "Initialize AI Application Server and deploy AI Apps"
          }
        },
        resourceSchema: (serverType === ServerTypes.SingleDomain) ? singleDomainAgentSchema : multiDomainAgentSchema,
        date: new Date().toLocaleString()
      }
    };
    if ( serverType === ServerTypes.SingleDomain )
      respMessage.data.resourceSchema.properties.applications.items = sdAiAppSchema;
    else
      respMessage.data.resourceSchema.properties.applications.items = mdAiAppSchema; 

    return(respMessage);
  }

  async #getAppServerDetails(req) { // => /cp/AiAppServer/get
    let serverDef = req.srvconf; // In-Memory server context

    if ( req.method !== HttpMethods.GET )
      return {
        http_code: 405, // Method not allowed
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${req.params.res_type}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };
    
    const serverId = serverDef.serverId;
    let respMessage;
    if ( serverDef.serverConfigType === ConfigProviderType.File) { // Return in-memory server context

      respMessage = {
        http_code: 200, // OK
        data : serverDef
      };
    }
    else {
      let aiServersDao = new PersistDao(persistdb, TblNames.AiAppServers);
      let values = [ serverId ];
      const srvData = await aiServersDao.queryTable(req.id, 1, values); // Retrieve the AI app server data
      if ( srvData.rCount === 1 ) {
        respMessage = {
          http_code: 200, // OK
          data : srvData.data[0]
        };
      }
      else // No server definition present in DB
        respMessage = {
          http_code: 200, // Resource (AI Server) not found in DB
          data: serverDef
        };
    };

    logger.log({ level: "info", message: "[%s] AiAppServerProcessor.getAppServerDetails(): Retrieved details for AI App Gateway: [%s]", splat: [scriptName, serverId] });
    return(respMessage);
  }

  async #deployAiApps(req) { // => /cp/AiAppServer/deploy
    // Deploy a bunch of Apps. 
    // CAUTION: This operation will replace all the Ai Apps currently deployed on the server &
    // load the new Ai Apps into the in-memory context!!
    let serverDef = req.srvconf; // In-Memory server context
    const serverId = req.body.serverId; // Server ID / Name to be updated
    const serverType = req.body.serverType; // Server type to be updated
    const providerType = serverDef.serverConfigType; // Server config provider type
    
    const srvName = serverDef.serverId; // Identity of the running server
    const srvType = serverDef.serverType; // Server type of the running server

    if ( req.method !== HttpMethods.POST )
      return {
        http_code: 405, // Method not allowed
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${serverId}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };

    if ( ( srvName !== serverId ) || ( srvType !== serverType) )
      return {
        http_code: 400, // Bad request
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `ID & Type of AI App Gateway [${srvName}: ${srvType}] does not match [${serverId}: ${serverType}] contained in request.  Unable to process request.`,
            code: "badRequest"
          }
        }
      };

    // Validate schema of new AI App Server
    let valResults = validateAiServerSchema(req.body);
    if ( ! valResults.schema_compliant ) {
      return {
        http_code: 400, // Bad request
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: "Unable to process request. Encountered schema validation errors.",
            errors: valResults.errors,
            code: "schemaValidationFailed"
          }
        }
      }
    }

    const aiApps = serverDef.applications ? serverDef.applications.length : 0;  // Existing Ai Apps being replaced (if any)

    // Persist server conf
    let fileSaved = false;
    let dbresp;
    if ( providerType === ConfigProviderType.File) {
      const cfgFile = process.env.API_GATEWAY_CONFIG_FILE;
      try {
        fs.writeFileSync(cfgFile, JSON.stringify(req.body));
        fileSaved = true;
      }
      catch ( err ) {
        logger.log({level: "error", message: "[%s] AiAppServerProcessor.deployAiApps():\n  AI App Gateway: %s\n  Encountered exception:\n%s", splat: [scriptName,srvName,err.stack]});
      };
    }
    else {
      const gatewayUri = req.body.aiGatewayUri ? req.body.aiGatewayUri : ( (serverType === ServerTypes.MultiDomain) ? DefaultAiGatewayUri : "NA"); // MD Server default gateway URI
      let aiSrvsDao = new PersistDao(persistdb, TblNames.AiAppServers);
      let values;
      if ( aiApps > 0 ) // Update
        values = [
          srvName,
          gatewayUri,
          { applications: req.body.applications }
        ];
      else // Insert
        values = [
          srvName,
          srvType,
          gatewayUri, // Optional and only required for MD Ai Server
          { applications: req.body.applications },
          req.user // created by
        ];
    
      dbresp = await aiSrvsDao.storeEntity( // Save the ai app server configuration
        req.id,
        (aiApps > 0) ? 1 : 0,
        values);
    };

    let respMessage;
    if ( fileSaved || (dbresp?.record_id > 0) ) {
      // Replace the AI Apps in in-memory context
      serverDef.applications = [];  // empty the in-memory context
      const noOfApps = req.body.applications.length; // No Ai Apps to be deployed
    
      for ( const app of req.body.applications )  // Populate the in-memory server context with updated Ai Apps
        serverDef.applications.push(app);

      respMessage = {
        http_code: 200, // No content (Record created / updated)
        data : {
          requestId: req.id,
          endpointUri: req.originalUrl,
          serverId: srvName,
          serverType: srvType,
          aiAppCount: noOfApps,
          status: (aiApps > 0) ? ResourceDBActions.Updated : ResourceDBActions.Created,
          date: new Date().toLocaleString()
        }
      };

      if ( serverType === ServerTypes.SingleDomain )
        reconfigEndpoints(); // Reinitialize app connection endpoints and cache metrics (SD Server)
      else
        reconfigAppMetrics(null); // Reinitialize metrics for all Ai Apps (MD Server)

      logger.log({ level: "info", message: "[%s] AiAppServerProcessor.deployAiApps(): Updated AI App Gateway: [%s]", splat: [scriptName, srvName] });
    }
    else {
      respMessage = {
        http_code: 500,  // Internal server error
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Action [${req.params.action}] on resource [${srvName}] failed.  Check server logs.`,
            code: "internalServerError"
          }
        }
      };
    };

    return(respMessage);
  }
} // end of class

module.exports = AiAppServerProcessor;