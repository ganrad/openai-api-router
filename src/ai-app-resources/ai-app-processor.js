/**
 * Name: AI Application Server Processor
 * Description: This class implements the CRUD operations for an AI Application resource.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-28-2025
 * Version: 2.2.0
 *
 * Notes:
*/

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("../utilities/logger.js");

const persistdb = require("../services/pp-pg.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const { 
  DefaultAiGatewayUri,
  HttpMethods, 
  ServerTypes, 
  AppResourceTypes, 
  AppResourceActions, 
  ResourceDBActions, 
  ConfigProviderType } = require("../utilities/app-gtwy-constants.js");
const { validateAiAppSchema, sdAiAppSchema, mdAiAppSchema } = require("../schemas/validate-json-config.js");
const { reinitAppConnection } = require("../routes/apirouter.js");
const { reconfigAppMetrics } = require("../routes/md-apirouter.js");

class AiAppProcessor {

  constructor() {
  }

  async executeOperation(req) {
    let respMessage;

    let action = req.params.action;
    if ( action === AppResourceActions.Operation )
      respMessage = this.#getResourceOperations(req);
    else if ( action === AppResourceActions.Deploy )
      respMessage = await this.#deployAiApp(req);
    else if ( action === AppResourceActions.Get )
      respMessage = await this.#getAiAppDetails(req);
    else if ( action === AppResourceActions.Delete )
      respMessage = await this.#deleteAiApp(req);
    else {
      respMessage = {
        http_code: 400,
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Resource Type [${AppResourceTypes.AiApplication}] does not support Action [${action}]! Unable to process request.`,
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
        resourceType: AppResourceTypes.AiApplication,
        operations: {
          operations: {
            uri: "/cp/AiApplication/operations",
            description: "Get operations supported by this AI resource"
          },
          get: {
            uri: "/cp/AiApplication/{ai-application-id}/get",
            description: "Get details of an AI Application by ID"
          },
          deploy: {
            uri: "/cp/AiApplication/{ai-application-id}/deploy",
            description: "Create / Update and deploy an AI Application"
          },
          delete: {
            uri: "/cp/AiApplication/{ai-application-id}/delete",
            description: "Delete an AI Application by ID"
          }
        },
        resourceSchema: (serverType === ServerTypes.SingleDomain) ? sdAiAppSchema : mdAiAppSchema,
        date: new Date().toLocaleString()
      }
    };

    return(respMessage);
  }

  async #getAiAppDetails(req) { // => /cp/AiApplication/{application-name}/get
    const appId = req.params.res_id;
    const serverDef = req.srvconf;

    if ( req.method !== HttpMethods.GET )
      return {
        http_code: 405, // Method not allowed
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${req.params.res_type}] and resource [${appId}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };
    
    const noOfApps = serverDef.applications ? serverDef.applications.length : 0;

    if ( !appId || (noOfApps === 0) )
      return {
        http_code: 404, // Resource not found
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `AI Application ID=[${appId}] not found! Unable to process request.`,
            code: "resourceNotFound"
          }
        }
      };

    let respMessage;
    let appExists = false;
    for ( const app of serverDef.applications ) {
      if ( app.appId === appId ) {
        appExists = true;
        respMessage = {
          http_code: 200, // OK
          data: app
        }
        break;
      };
    };

    if ( !appExists )
      respMessage = {
        http_code:  404, // Resource not found
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `AI Application ID=[${appId}] not found! Unable to process request.`,
            code: "resourceNotFound"
          }
        }
      };
    else
      logger.log({ level: "info", message: "[%s] AiAppProcessor.getAiAppDetails(): Retrieved data for AI App: [%s]", splat: [scriptName, appId] });
    
    return(respMessage);
  }

  async #deployAiApp(req) { // (Insert / Update) => /cp/AiApplication/{application-name}/deploy
    let serverDef = req.srvconf;
    const serverName = serverDef.serverId;
    const serverType = serverDef.serverType;
    const providerType = serverDef.serverConfigType;

    if ( req.method !== HttpMethods.POST )
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

    // Check payload
    if ( !req.body.appId )
      return {
        http_code: 400, // Bad request
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: "AI Application ID or Request (payload) is invalid.  Unable to process request.",
            code: "badRequest"
          }
        }
      };

    // Validate schema of new ai application
    let valResults = validateAiAppSchema(req.body, serverType);
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

    // Add / Update the app definition
    const noOfApps = serverDef.applications ? serverDef.applications.length : 0;
    let appName = req.body.appId;
    let appExists = false;
    if ( noOfApps > 0 ) { // Add / replace ai app definition
      let appIdx = 0;
      for ( const app of serverDef.applications ) {
        if ( app.appId === appName ) {
          appExists = true;
          break;
        };
        appIdx++;
      };
      if ( appExists ) {
        serverDef.applications.splice(appIdx,1,req.body); // Replace
        if ( serverType === ServerTypes.SingleDomain )
          reinitAppConnection(appName); // Remove + re-init Ai App Connections (endpoints) & associated cache metrics
        else
          reconfigAppMetrics(appName);
      }
      else
        serverDef.applications.push(req.body);  // Add
    }
    else // No ai apps found
      serverDef.applications = [ req.body ];

    // Persist server conf
    let dbresp;
    if ( providerType === ConfigProviderType.SqlDB ) {
      let aiSrvsDao = new PersistDao(persistdb, TblNames.AiAppServers);
      let values;
      if ( noOfApps > 0 ) // Update
        values = [
          serverName,
          { applications: serverDef.applications }
        ];
      else { // Insert
        serverDef.aiGatewayUri = (serverType === ServerTypes.MultiDomain) ? DefaultAiGatewayUri : "NA";

        values = [
          serverName,
          serverType,
          serverDef.aiGatewayUri,
          { applications: serverDef.applications },
          req.user, // created by
        ];
      };
    
      dbresp = await aiSrvsDao.storeEntity( // Save the ai app server configuration
        req.id,
        (noOfApps > 0) ? 5 : 0,
        values);
    };
  
    let respMessage;
    if ( (providerType === ConfigProviderType.File) || (dbresp?.record_id > 0) ) {
      respMessage = {
        http_code: appExists ? 200 : 201, // Record updated : created
        data : {
          requestId: req.id,
          endpointUri: req.originalUrl,
          serverId: serverName,
          serverType: serverType,
          appId: appName,
          status: appExists ? ResourceDBActions.Updated : ResourceDBActions.Created,
          date: new Date().toLocaleString()
        }
      };

      logger.log({ level: "info", message: "[%s] AiAppProcessor.deployAiApp(): Deployed AI App: [%s]", splat: [scriptName, appName] });
    }
    else {
      respMessage = {
        http_code: 500,  // Internal server error
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Action [${action}] on resource type ${req.params.res_type}, Resource [${appName}] failed.  Check server logs.`,
            code: "internalServerError"
          }
        }
      };
    };

    return(respMessage);
  }

  async #deleteAiApp(req) { // => /cp/AiApplication/{application-name}/delete
    let serverDef = req.srvconf;
    const appId = req.params.res_id;
    const serverName = serverDef.serverId;
    const serverType = serverDef.serverType;
    const providerType = serverDef.serverConfigType;

    if ( req.method !== HttpMethods.DELETE )
      return {
        http_code: 405, // Method not allowed
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Method [${req.method}] not supported for Action [${req.params.action}] on resource type [${req.params.res_type}] and resource [${appId}].  Unable to process request.`,
            code: "methodNotAllowed"
          }
        }
      };

    // Delete the app definition
    let noOfApps = serverDef.applications ? serverDef.applications.length : 0;
    let appExists = false;
    let appIdx = 0;
    if ( noOfApps > 0 ) { // Add / replace ai app definition
      for ( const app of serverDef.applications ) {
        if ( app.appId === appId ) {
          appExists = true;
          break;
        };
        appIdx++;
      };
    };

    if ( appExists ) {
      serverDef.applications.splice(appIdx,1); // Remove Ai App from in memory context
      if ( serverType === ServerTypes.SingleDomain )
        reinitAppConnection(appId); // Delete Ai App Connections (endpoints) & associated cache metrics
      else
        reconfigAppMetrics(appId);
    }
    else
      return {
        http_code:  404, // Resource not found
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `AI Application ID=[${appId}] not found! Unable to process request.`,
            code: "resourceNotFound"
          }
        }
      };
    
    noOfApps = serverDef.applications.length;

    // Persist server conf
    let dbresp;
    if ( providerType === ConfigProviderType.SqlDB ) {
      let aiSrvsDao = new PersistDao(persistdb, TblNames.AiAppServers);
      let values;
      if ( noOfApps > 0 ) // Update
        values = [
          serverName,
          { applications: serverDef.applications }
        ];
      else // Delete
        values = [
          serverName
        ];
    
      dbresp = await aiSrvsDao.storeEntity( // Update / Delete the ai app server configuration
        req.id,
        (noOfApps > 0) ? 5 : 4,
        values);
    };
  
    let respMessage;
    if ( (providerType === ConfigProviderType.File) || (dbresp?.record_id > 0) ) {
      respMessage = {
        http_code: 204, // No content
        data : {
          requestId: req.id,
          endpointUri: req.originalUrl,
          serverId: serverName,
          serverType: serverType,
          appId: appId,
          status: ResourceDBActions.Deleted,
          date: new Date().toLocaleString()
        }
      };

      logger.log({ level: "info", message: "[%s] AiAppProcessor.deleteAiApp(): Deleted AI App: [%s]", splat: [scriptName, appId] });
    }
    else {
      respMessage = {
        http_code: 500,  // Internal server error
        data: {
          endpointUri: req.originalUrl,
          error: {
            message: `Action [${action}] on resource type ${req.params.res_type}, Resource [${appId}] failed.  Check server logs.`,
            code: "internalServerError"
          }
        }
      };
    };

    return(respMessage);
  }
} // end of class

module.exports = AiAppProcessor;