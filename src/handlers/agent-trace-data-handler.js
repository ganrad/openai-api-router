/**
 * Name: AgentTraceDataHandler
 * Description: This class retrieves agent traces recursively.  Agents could be distributed across multiple ai gateway servers.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 08-25-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');

const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");
const {
  ServerTypes,
  HttpMethods,
  CustomRequestHeaders,
  RemoteServerProtocol,
  GatewayRouterEndpoints
} = require("../utilities/app-gtwy-constants.js");
const AbstractDataHandler = require("./abstract-data-handler.js");

class AgentTraceDataHandler extends AbstractDataHandler {
  constructor() {
    super();
  }

  #performSingleDomainAgentTraceChecks(req) {
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
    const threadId = req.params.thread_id; // AI App. Thread ID
    logger.log({ level: "info", message: "[%s] %s.#performSingleDomainAgentTraceChecks():\n  Req ID: %s\n  AI Application ID: %s\n  Thread ID: %s", splat: [scriptName, this.constructor.name, req.id, appId, threadId] });

    if (!threadId || !appId) {
      err_obj = {
        error: {
          endpointUri: req.originalUrl,
          message: `AI Application ID [${appId}] and Thread ID [${threadId}] are required parameters! Unable to process request.`,
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

  #formatDateTime(pgTimestamp) {
    const date = new Date(pgTimestamp);

    const formatter = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    // Format returns parts like "06/07/2026, 02:30:00 PM"
    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));

    return `${map.month}-${map.day}-${map.year} ${map.hour}:${map.minute}:${map.second} ${map.dayPeriod}`;
  }

  #getRemoteAiGatewayUri(agentCardUri, appName, threadId) {
    return(agentCardUri.split(GatewayRouterEndpoints.A2AEndpoint)[0] + GatewayRouterEndpoints.AgentTraceEndpoint + `/${appName}/${threadId}`);
  }

  // Invoke remote AI Gateway Server
  async #invokeRemoteAgent(requestid, uri, headers) {
    let agentTraceResponse;

    try {
      // Node.js built-in fetch accepts the URI and an optional configuration object
      const response = await fetch(uri, {
        method: HttpMethods.GET, // Default method is GET.  Can be changed later if needed.
        headers: headers
      });

      // Optional: fetch doesn't throw on HTTP errors (like 404 or 500). 
      // If you want it to trigger the catch block for those, uncomment the line below:
      if (!response.ok) throw new Error(`HTTP error! Message: ${response.statusText}, Status: ${response.status}`);

      agentTraceResponse = await response.json();
    } 
    catch (error) {
      logger.log({ level: "warn", message: "[%s] %s.#invokeRemoteUri():\n  Req ID: %s\n  Target URI: %s\n  Error: %s", splat: [scriptName, this.constructor.name, requestid, uri, error] });
      
      // Return null
      return null;
    };

    return(agentTraceResponse.messageTrace?.turns[0]);
  }

  async #getSingleDomainAgentTrace(req) {
    let respMessage = this.#performSingleDomainAgentTraceChecks(req);
    if (respMessage)
      return (respMessage);

    let err_msg;
    let planRow;
    let detailRows;

    let turns = []; // Init the conversation turns array, for the thread id

    const appId = req.params.app_id; // AI Application ID
    const threadId = req.params.thread_id; // Thread ID
    const requestId = req.get(CustomRequestHeaders.RequestId); // Request ID

    // 1. Retrieve all requests for the thread_id in ascending order of id
    const promptsDao = new PersistDao(persistdb, TblNames.Prompts);
    let values = [
      req.targeturis.serverId,
      appId,
      threadId
    ];
    if (requestId)
      values.push(requestId);

    const promptResults = (requestId) ? await promptsDao.queryTable(req.id, 3, values) : await promptsDao.queryTable(req.id, 2, values);
    if (promptResults.errors) {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: promptResults.errors,
          code: "dataFetchException"
        }
      };

      respMessage = {
        http_code: 500, // Internal server error
        data: err_msg
      };

      return (respMessage);
    };
    if (!promptResults.rCount) {
      err_msg = {
        error: {
          endpointUri: req.originalUrl,
          message: `No requests found for AI Application ID: ${appId}, and Thread ID: ${threadId}!`,
          code: "noData"
        }
      };

      respMessage = {
        http_code: 404, // 404 No resource found
        data: err_msg
      };

      return (respMessage);
    };

    const toolPlanDao = new PersistDao(persistdb, TblNames.ToolExecPlan);
    const toolExecDetailsDao = new PersistDao(persistdb, TblNames.ToolExecDetails);

    let turnObject;
    let promptRows = promptResults.data;
    for (const request of promptRows) {
      turnObject = {
        serverName: request.srv_name,
        replicaName: request.instance || 'NA',
        requestId: request.requestid,
        threadId: request.threadid,
        appName: request.aiappname,
        userName: request.uname,
        dateTime: this.#formatDateTime(request.timestamp_),
        generationModel: request.gen_model,
        generationInputTokens: request.gen_input_tokens,
        generationOutputTokens: request.gen_output_tokens,
        executionTimeSecs: request.exec_time_secs
      };

      values = [
        req.targeturis.serverId,
        request.requestid,
        appId
      ];
      // 2. Retrieve tool execution plan
      const toolPlanResult = await toolPlanDao.queryTable(req.id, 1, values);
      // 3. Retrieve end to end agent trace
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

      if ( toolPlanResult.rCount > 0) {
        planRow = toolPlanResult.data[0];
        detailRows = toolTraceResults.data;

        const toolPlan = {
          plannerModel: planRow.planner_model,
          inputTokens: planRow.prompt_tokens,
          outputTokens: planRow.completion_tokens,
          executionTimeSecs: planRow.exec_time_secs
        };

        const toolExecDetails = [];
        for (const tool of detailRows) {
          const toolTrace = {
            sequenceId: tool.seq_id,
            toolName: tool.tool_name,
            toolType: tool.rem_srv_type,
            serverId: tool.server_id,
            serverUri: tool.target_uri,
            ...(tool.exception && {exception: tool.exception}),
            status: tool.status.toLowerCase(),
            executionTimeSecs: tool.exec_time_secs,
          };

          // 4. If remote server type = A2A, then retrieve the agent trace details from remote ai gateway server
          if ( tool.rem_srv_type === RemoteServerProtocol.A2A ) {
            if ( req.targeturis.serverId === tool.server_id ) { // Child-agent is running within the same ai gateway server

            }
            else { // Child-agent is hosted on another ai gateway server
              const remoteAgentTraceUri = this.#getRemoteAiGatewayUri(tool.target_uri, tool.tool_name.split('__')[1] || '', tool.threadid);
              const agentRunDetails = await this.#invokeRemoteAgent(req.id, remoteAgentTraceUri, {[CustomRequestHeaders.RequestId]: request.requestid}); // Add OAuth token headers later

              if ( agentRunDetails )
                toolTrace.agentRunDetails = agentRunDetails;
            }
          };
          toolExecDetails.push(toolTrace);
        };
        toolPlan.toolExecDetails = toolExecDetails;

        turnObject.toolPlan = toolPlan;
      };

      turns.push(turnObject);
    };

    respMessage = {
      http_code: 200, // OK
      data: {
        messageTrace: { turns },
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
      }
    };
    // console.log(`***** Retrieved agent trace: ${JSON.stringify(respMessage, null, 2)}`);

    return (respMessage);
  }

  async handleRequest(request) {
    let response = null;

    switch (request.method) {
      case HttpMethods.GET:
        switch (request.targeturis.serverType) {
          case ServerTypes.SingleDomain:
            response = await this.#getSingleDomainAgentTrace(request);
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

module.exports = AgentTraceDataHandler;