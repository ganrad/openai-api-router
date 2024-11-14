/**
 * Name: AI App Gateway Retrieval Tool
 * Description: This class implements a retrieval tool for Single-domain AI Application Gateway.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');
const { CustomRequestHeaders } = require("../utilities/app-gtwy-constants.js");

class AiAppGatewayTool {

  constructor() {
  }

  async processRequest(
    req, // 0 Request Object
    threadId, // 1 Thread ID
    toolConfig, // 2 Tool config 
    toolMsgs, // 3 Tool req + resp. messages
    tracer) { // 4 Tool execution path tracer

    let serverConfig = req.targeturis; // AI App Gateway configuration object
    let gatewayUri = (toolConfig.targetUri) ? toolConfig.targetUri : serverConfig.aiGatewayUri;
    gatewayUri += "/";
    gatewayUri += toolConfig.appName;

    let respMessage = null; // Populate this var before returning!
    let status = 0;
    let response = null;
    let payload = null;
    let data = null;
    let stTime = Date.now();
    try {
      const meta = new Map();
      meta.set('Content-Type', 'application/json');
      if (threadId)
        meta.set(CustomRequestHeaders.ThreadId, threadId);

      // meta.set('api-key',element.apikey);

      payload = JSON.parse(JSON.stringify(toolConfig.prompt)); // Create a new copy of the prompt object; messages array
      // console.log(`Prompt: ${JSON.stringify(payload)}`);
      let inputTools = toolConfig.payloadToolId; // An array of tool names ~ ID's
      if ((!threadId) && inputTools) {
        inputTools.forEach(element => {
          let mesg = toolMsgs.get(element).response;
          if ( mesg ) {
            let msgContent = JSON.stringify(mesg.content);
            let sendMesg = {
              role: "user",
              content: msgContent
            }
            // payload.messages = payload.messages.concat(toolMsgs.get(toolConfig.payloadToolId).response);
            payload.messages = payload.messages.concat(sendMesg);
          };
        });
      }
      else
        payload.messages = payload.messages.concat(req.body.messages);
      // console.log(`Req.body.messages: ${JSON.stringify(req.body.messages)}`);
      // console.log(`Payload.messages: ${JSON.stringify(payload.messages)}`);

      response = await fetch(gatewayUri, {
        method: req.method,
        headers: meta,
        body: JSON.stringify(payload)
      });

      status = response.status;
      data = await response.json();

      if (status === 200) {
        toolMsgs.set(toolConfig.toolName, {
          request: payload.messages,
          response: data.choices[0].message
        });

        if (toolConfig.stateful)
          threadId = response.headers.get(CustomRequestHeaders.ThreadId);
      };

      respMessage = {
        http_code: status,
        threadId: threadId,
        data: data
      };
    }
    catch (error) {
      data = {
        error: {
          target: gatewayUri,
          message: `AI Application Gateway encountered exception: [${error}].`,
          code: "internalFailure"
        }
      };
      logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, JSON.stringify(data, null, 2)] });

      respMessage = {
        http_code: 500,
        data: data
      };
    };
    tracer.addToolTraceData(
      {
        toolName: toolConfig.toolName,
        type: toolConfig.toolType,
        targetUri: gatewayUri,
        startTime: new Date(stTime).toLocaleDateString("en-US") + " " + new Date(stTime).toLocaleTimeString("en-US"),
        status: status,
        statusText: response?.statusText,
        executionTime: (Date.now() - stTime) / 1000, // Tool execution time in seconds
        gtwyRequestId: response?.headers.get(CustomRequestHeaders.RequestId),
        request: payload,
        response: data
      });

    return (respMessage);
  } // end of processRequest()
} // end of class

module.exports = AiAppGatewayTool;