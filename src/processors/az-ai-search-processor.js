/**
 * Name: Azure AI Search service processor
 * Description: This class implements a processor for executing Azure AI Search API requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-25-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const fetch = require("node-fetch");

class AzAiSearchProcessor {

  constructor() {
  }
 
  async processRequest(
    req, // 0
    config) { // 1

    let appConnections = arguments[2]; // EP metrics obj for all apps
    // console.log(`*****\nAzAiSearchProcessor.processRequest():\n  URI: ${req.originalUrl}\n  Request ID: ${req.id}\n  Application ID: ${config.appId}\n  Type: ${config.appType}`);
    logger.log({level: "info", message: "[%s] %s.processRequest():\n  URI: %s\n  Request ID: %s\n  Application ID: %s\n  Type: %s", splat: [scriptName,this.constructor.name,req.originalUrl,req.id,config.appId,config.appType]});
    
    let respMessage = null; // Populate this var before returning!

    let epdata = appConnections.getConnection(config.appId);
    let stTime = Date.now();

    let response;
    let data;
    let status;
    let err_msg;
    for (const element of config.appEndpoints) { // start of endpoint loop
      let metricsObj = epdata.get(element.uri); 

      try {
        const meta = new Map();
        meta.set('Content-Type','application/json');
        meta.set('api-Key',element.apikey);
	
        response = await fetch(element.uri, {
          method: req.method,
	  headers: meta,
          body: JSON.stringify(req.body)
        });
        status = response.status;

        if ( status === 200 ) { // All Ok
          data = await response.json();

          let respTime = Date.now() - stTime;
	  metricsObj.updateApiCalls(req.body,respTime);

	  respMessage = {
	    http_code: status,
	    data: data
	  };

          return(respMessage);
        }
        else {
	  data = await response.text();

          // console.log(`*****\nAzAiSearchProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Status Text: ${response.statusText}\n*****`);
          logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText]});

	  metricsObj.updateFailedCalls(0);

	  err_msg = {
	    appId: config.appId,
	    reqId: req.id,
	    targetUri: element.uri,
	    http_code: status,
	    status_text: response.statusText,
	    data: data,
	    cause: `AI Service endpoint returned exception message [${response.statusText}]`
	  };

	  respMessage = {
	    http_code: status,
	    data: err_msg
	  };
        };
      }
      catch (error) {
        err_msg = {
	  appId: config.appId,
	  reqId: req.id,
	  targetUri: element.uri,
	  cause: error
	};
        // console.log(`*****\nAzAiSearchProcessor.processRequest():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
        logger.log({level: "error", message: "[%s] %s.processRequest():\n  Encountered exception:\n  %s", splat: [scriptName,this.constructor.name,err_msg]});

	respMessage = {
          http_code: 500,
	  data: err_msg
	};

        break;
      };
    }; // end of endpoint loop

    if ( respMessage == null ) {
      err_msg = {
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
        errorMessage: "Internal server error. Unable to process request. Check server logs."
      };

      respMessage = {
	http_code: 500, // Internal API Gateway server error!
	data: err_msg
      };
    };

    return(respMessage);
  } // end of processRequest()
}

module.exports = AzAiSearchProcessor;
