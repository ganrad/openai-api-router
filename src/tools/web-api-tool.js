/**
 * Name: Web API Retrieval Tool
 * Description: This class implements a tool that retrieves data by calling an external Web/REST API endpoint.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 * ID12042025: ganrad: v2.9.5: Log error message details.
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');
const { formatException } = require('../utilities/helper-funcs'); // ID12042025.n

class WebApiAppTool {

  constructor() {
  }

  async processRequest(
    req, // 0 Request Object
    threadId, // 1 Thread ID (Not used)
    toolConfig, // 2 Tool config 
    toolMsgs, // 3 Tool req + resp. messages
    tracer) { // 4 Tool execution path tracer

    let webEndpointUri = toolConfig.targetUri;

    let respMessage = null; // Populate this var before returning!
    let status = 0;
    let response = null;
    let payload = null;
    let data = null;
    let stTime = Date.now();
    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      // meta.set('api-key',element.apikey);

      if (toolConfig.prompt)
        payload = JSON.parse(JSON.stringify(toolConfig.prompt)); // IMP: Create a new copy of the prompt object; messages array
      else
        payload = {
          messages: []
        };

      let inputTools = toolConfig.payloadToolId; // An array of tool names ~ ID's
      if ( inputTools ) {
        inputTools.forEach(element => {
          payload.messages = payload.messages.concat(toolMsgs.get(element).response);
        });
      }
      else
        payload.messages = payload.messages.concat(req.body.messages);
      // console.log(`Req.body.messages: ${JSON.stringify(req.body.messages)}`);
      console.log(`Payload: ${JSON.stringify(payload)}`);

      response = await fetch(webEndpointUri, {
        method: req.method,
        headers: meta,
        body: JSON.stringify(payload)
      });

      status = response.status;
      let respData = await response.json();
      // let respData = await response.text();

      if (status === 200) {
        // Convert to cannonical format
        data = {
          choices: [
            {
              message: {
                role: "assistant",
                content: respData
              }
            }
          ]
        };

        toolMsgs.set(toolConfig.toolName, {
          request: payload.messages,
          response: data.choices[0].message
        });
      };

      respMessage = {
        http_code: status,
        data: data
      };
    }
    catch (error) {
      data = {
        error: {
          target: webEndpointUri,
          message: `Encountered exception when invoking Web API Endpoint: [${error.message}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, formatException(data)] });

      respMessage = {
        http_code: 500,
        data: data
      };
    };
    tracer.addToolTraceData(
      {
        toolName: toolConfig.toolName,
        type: toolConfig.toolType,
        targetUri: webEndpointUri,
        startTime: new Date(stTime).toLocaleDateString("en-US") + " " + new Date(stTime).toLocaleTimeString("en-US"),
        status: status,
        statusText: response?.statusText,
        executionTime: Date.now() - stTime,
        request: payload,
        response: data
      });

    return (respMessage);
  } // end of processRequest()
} // end of class

module.exports = WebApiAppTool;