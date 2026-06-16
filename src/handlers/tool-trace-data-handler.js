/**
 * Name: ToolTraceDataHandler
 * Description: This class retrieves tool execution plan and details (trace)
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-23-2026
 * Version (Introduced): 3.1.0
 *
 * Notes:
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');

const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");
const { ServerTypes, HttpMethods, DocProcessorStatus } = require("../utilities/app-gtwy-constants.js"); // ID09152025.n
const AbstractDataHandler = require("./abstract-data-handler.js");

class ToolExecutionTraceDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #performSingleDomainAppToolTraceChecks(req) {
    let respMessage;
    let err_msg;

    if (!(process.env.API_GATEWAY_PERSIST_PROMPTS === "true")) {
      err_obj = {
        error: {
          endpointUri: req.originalUrl,
          message: `Persistence layer is not enabled for this AI App Gateway instance: ${req.targeturis.serverId}! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (respMessage);
    };

    const appId = req.params.app_id; // AI Application ID
    const requestId = req.params.request_id; // AI App. Request ID
    logger.log({ level: "info", message: "[%s] %s.#performSingleDomainAppToolTraceChecks():\n  Req ID: %s\n  AI Application ID: %s\n  Request ID: %s", splat: [scriptName, this.constructor.name, req.id, appId, requestId] });

    if (!requestId || !appId) {
      err_obj = {
        error: {
          endpointUri: req.originalUrl,
          message: `AI Application ID [${appId}] and Request ID [${requestId}] are required parameters! Unable to process request.`,
          code: "invalidPayload"
        }
      };

      respMessage = {
        http_code: 400, // Bad request
        data: err_msg
      };

      return (respMessage);
    };

    return (null);  // No exceptions!
  }

  async #getSingleDomainAppToolExecTrace(req) {
    let respMessage = this.#performSingleDomainAppToolTraceChecks(req);
    if (respMessage)
      return (respMessage);

    let err_msg;
    let planRow;
    let detailRows;

    const appId = req.params.app_id; // AI Application ID
    const requestId = req.params.request_id; // AI App. Request ID

    const toolPlanDao = new PersistDao(persistdb, TblNames.ToolExecPlan);
    let values = [
      req.targeturis.serverId,
      requestId,
      appId
    ];
    const toolPlanResult = await toolPlanDao.queryTable(req.id, 1, values);

    const toolExecDetailsDao = new PersistDao(persistdb, TblNames.ToolExecDetails);
    const toolTraceResults = await toolExecDetailsDao.queryTable(req.id, 1, values);

    if (toolPlanResult.errors || toolTraceResults.errors) {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: toolPlanResult.errors || toolTraceResults.errors,
          code: "dataFetchException"
        }
      };

      respMessage = {
        http_code: 500, // Internal server error
        data: err_msg
      };

      return (respMessage);
    };

    if ( !toolPlanResult.rCount ) {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: `No tool execution plan found for requestId: ${requestId}!`,
          code: "noData"
        }
      };

      respMessage = {
        http_code: 404, // 404 No resource found
        data: err_msg
      };

      return (respMessage);
    };

    planRow = toolPlanResult.data[0];
    detailRows = toolTraceResults.data;
    
    // Helper: safely parse JSON that may already be an object or may be a string
    const safeParseJson = (value) => {
      if (value == null) return null;
      if (typeof value === "object") return value;
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } 
        catch {
          return value; // preserve original if invalid JSON
        };
      }

      return value;
    };

    const normalizedDetails = (detailRows || [])
      .map((row) => ({
        seqId: row.seq_id,
        toolName: row.tool_name || null,
        remoteServerType: row.rem_srv_type || null,
        targetUri: row.target_uri || null,
        serverId: row.server_id || null,
        status: row.status || "Unknown",
        executionTimeSecs: row.exec_time_secs ?? null,
        requestJson: safeParseJson(row.request_json),
        responseJson: safeParseJson(row.response_json),
        exception: row.exception || null,
        createdDate: row.create_date || null
      }))
      .sort((a, b) => (a.seqId ?? 0) - (b.seqId ?? 0));

    const completedTools = normalizedDetails.filter(
      (x) => (x.status || "") === DocProcessorStatus.Completed
    ).length;

    const failedTools = normalizedDetails.filter(
      (x) => (x.status || "") === DocProcessorStatus.Failed
    ).length;

    const totalExecutionTimeSecs =
      normalizedDetails.reduce((sum, x) => sum + (Number(x.executionTimeSecs) || 0), 0) +
      (Number(planRow?.exec_time_secs) || 0);

    let overallStatus = DocProcessorStatus.Completed;
    if (failedTools > 0 && completedTools > 0) {
      overallStatus = "PartialFailure";
    } 
    else if (failedTools > 0 && completedTools === 0) {
      overallStatus = DocProcessorStatus.Failed;
    } 
    else if (normalizedDetails.length === 0 && planRow) {
      overallStatus = "PlanOnly";
    };

    const responsePayload = {
      requestId: planRow?.requestid || normalizedDetails[0]?.requestId || requestId,
      threadId: planRow?.threadid || detailRows?.[0]?.threadid || null,
      aiAppName: planRow?.aiappname || detailRows?.[0]?.aiappname || null,
      serverName: planRow?.srv_name || detailRows?.[0]?.srv_name || null,
      userName: planRow?.uname || detailRows?.[0]?.uname || null,
      createdDate: planRow?.create_date || detailRows?.[0]?.create_date || null,

      summary: {
        toolsEvaluated: planRow?.evaltools ?? 0,
        toolExecutions: normalizedDetails.length,
        totalExecutionTimeSecs: Number(totalExecutionTimeSecs.toFixed(3)),
        completedTools,
        failedTools,
        overallStatus
      },

      plan: {
        generatedByAiApp: planRow?.aiapp_gen_plan,
        generatedByModel: planRow?.planner_model,
        generatedPlan: safeParseJson(planRow?.toolplan),
        planCompletionTokens: planRow?.completion_tokens,
        planPromptTokens: planRow?.prompt_tokens,
        generatePlanExecutionTimeSecs: planRow?.exec_time_secs ?? null
      },

      executionSteps: normalizedDetails
    };

    console.log(`***** Retrieved tool trace: ${JSON.stringify(responsePayload, null, 2)}`);
    respMessage = {
      http_code: 200, // OK
      data: {
        messageTrace: responsePayload,
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
      }
    };

    return (respMessage);
  }

  async handleRequest(request) {
    let response = null;

    switch (request.method) {
      case HttpMethods.GET:
        switch (request.targeturis.serverType) {
          case ServerTypes.SingleDomain:
            response = await this.#getSingleDomainAppToolExecTrace(request);
            break;
          default:
            err_obj = {
              error: {
                endpointUri: req.originalUrl,
                message: `Invalid AI Gateway server type: ${request.targeturis.serverType} (Supported: ${ServerTypes.SingleDomain})! Unable to process request.`,
                code: "invalidPayload"
              }
            };
            response = {
              http_code: 400, // Bad request
              data: err_msg
            };
            break;
        };
        break;
      default:
        err_obj = {
          error: {
            endpointUri: req.originalUrl,
            message: `Incorrect Http method: ${request.method} (Supported: ${HttpMethods.GET})! Unable to process request.`,
            code: "invalidPayload"
          }
        };
        response = {
          http_code: 400, // Bad request
          data: err_msg
        };
        break;
    };

    return (response);
  }
}

module.exports = ToolExecutionTraceDataHandler;