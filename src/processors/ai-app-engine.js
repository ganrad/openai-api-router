/**
 * Name: AI App Engine
 * Description: This class implements the AI Apps tool orchestration & execution engine.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-04-2024
 * Version: v2.1.0
 *
 * Notes:
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { CustomRequestHeaders, RetrievalToolTypes, ToolConditions } = require("../utilities/app-gtwy-constants.js");
const ToolExecPathTracer = require('../utilities/tool-exec-path-tracer');
const AiRetrievalToolsFactory = require("../tools/ai-tools-factory.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");

class AiAppEngine {

  constructor() {
  }

  async processRequest(
    req, // 0 Request object
    appConfig, // 1 Application config / metadata
    appMetrics) { // 2 Ai App Metrics

    let apps = req.targeturis; // Ai applications object
    let instanceName = (process.env.POD_NAME) ? apps.serverId + '-' + process.env.POD_NAME : apps.serverId; // AI App Gateway unique identity
    let nextToolToExecute = null; // When a session is active, identify the tool which needs to be executed

    // 1. Retrieve thread ID from request header
    let threadId = req.get(CustomRequestHeaders.ThreadId);

    logger.log({ level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  Thread ID: %s\n  URL: %s\n  User: %s\n  Application ID: %s\n  Request Payload:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, req.originalUrl, req.user?.name, appConfig.appId, JSON.stringify(req.body, null, 2)] });

    let respMessage = null; // Populate this var before returning!
    let err_msg = null;  // Populate this var in case there is an exception.

    // 2. Check if thread is active in memory. If not return an exception.
    if ( threadId ) {
      let memoryDao = new PersistDao(persistdb, TblNames.Memory);
      let values = [
        threadId,
        appConfig.appId
      ];
      const result = await memoryDao.queryTable(req.id,2,values);
      if ( result.rCount !== 1 ) { // Check if thread is active in memory. If not return.
        err_msg = {
          error: {
            target: req.originalUrl,
            message: `The user session associated with Thread ID=[${threadId}] has either expired or is invalid! Start a new user session.`,
            code: "invalidPayload"
          }
        };

        respMessage = {
          http_code: 400, // Bad request
          data: err_msg
        };

        return (respMessage);
      }
      else
        nextToolToExecute = result.data[0].tool_name;
    };

    // 3. Process tools configured for this AI Application
    let toolMessages = new Map();
    let toolTracer = new ToolExecPathTracer(req.id, appConfig.appId);
    for (const tool of appConfig.appTools) { // start of tools for loop
      if (nextToolToExecute && (tool.toolName !== nextToolToExecute))
        continue; // skip execution of this tool!

      let toolType = tool.toolType;
      let retrievalTool = new AiRetrievalToolsFactory().getRetrievalTool(toolType);
      if (retrievalTool) {
        respMessage = await retrievalTool.processRequest(
          req,
          threadId,
          tool,
          toolMessages,
          toolTracer);
      }
      else {
        err_msg = {
          error: {
            target: tool.toolType,
            message: `Unrecognized tool type ${toolType} in AI Application config. Aborting tool processing.`,
            code: "invalidPayload"
          }
        };
        respMessage = {
          http_code: 400, // bad request!  Client has to inform app team to fix server config. issue.
          data: err_msg
        };
      };
      if (respMessage.http_code !== 200) {
        break; // Stop processing tools and break out of the loop on exception!
      }
      else {
        if ( respMessage.threadId && (threadId !== respMessage.threadId) ) {
          let memoryDao = new PersistDao(persistdb, TblNames.Memory);
          let values = [
            respMessage.threadId,
            tool.appName,
            tool.toolName,
            appConfig.appId,
            instanceName
          ];
          await memoryDao.storeEntity(req.id, 2, values);
          logger.log({ level: "info", message: "[%s] %s.processRequest(): Updated memory table with tool info.\n  Request ID: %s\n  Thread ID: %s\n  SD App ID: %s\n  MD Application ID: %s\n  Tool Name: %s", splat: [scriptName, this.constructor.name, req.id, respMessage.threadId, tool.appName, appConfig.appId, tool.toolName]});
        };

        switch (tool.condition) {
          case ToolConditions.BRANCH:
            nextToolToExecute = respMessage.data.choices[0].message.content;
            break;
          case ToolConditions.STOP:
            nextToolToExecute = ToolConditions.STOP;
            break;
          default:
            nextToolToExecute = tool.condition; // Tool 'condition' can be set to any other tool name specified down in the tools array!
        };
      };
    }; // end of tools for loop
    toolTracer.endTime = Date.now();
    appMetrics.updateAiAppMetrics((respMessage.http_code === 200),toolTracer.executionTime);

    // 4. Insert tool execution path in tools trace DB table
    let toolsExecPath = toolTracer.getToolsExecutionPath();
    if (appConfig.enableToolTrace) {
      let toolsExecPathDao = new PersistDao(persistdb, TblNames.ToolsTrace);
      let values = [
        req.id,
        instanceName,
        appConfig.appId,
        req.body.user,
        toolsExecPath
      ];

      await toolsExecPathDao.storeEntity(req.id, 0, values);
    };
    logger.log({ level: "debug", message: "[%s] %s.processRequest(): Tool Execution Trace:\n%s", splat: [scriptName, this.constructor.name, JSON.stringify(toolsExecPath, null, 2)] });

    return (respMessage);
  } // end of processRequest()
}

module.exports = AiAppEngine;