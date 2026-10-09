/**
 * Name: Tool planner and executor class
 * Description: This class is responsible for planning and executing remote tool invocations as part of the inference processing pipeline.
 * It plans the sequence and execution of remote tools and executes them to gather additional context to provide to LLM and generate accurate
 * precise responses.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-17-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');
const {
  CustomRequestHeaders,
  MessageRoleTypes,
  OpenAIChatCompletionMsgRoleTypes,
  McpMethods,
  McpToolExecutionTypes,
  McpServerAuthTypes,
  RemoteServerProtocol,
  DocProcessorStatus,
  ToolPlannerTypes,
  AzAiServices
} = require("../utilities/app-gtwy-constants.js");
const { sendStatus, sendTrace, sendError } = require("../lib/sse-event-broker.js");
const helper = require("../utilities/helper-funcs.js");
const { getMcpServerResponse } = require("./clients/mcp-client.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");

class ToolPlannerExecutorV0 {

  // Enhanced LLM prompt for multi-tool selection and planning
  // V0
  /* static ToolSelectorPrompt = (query, tools) => `
Given the user query: "${query}"
And available MCP tools (with output schemas): ${JSON.stringify(tools, null, 2)}
Plan and select one or more tools to handle the query. Return a JSON object with:
- plan: string ("parallel") for concurrent invocation, Or JSON Array of sequences like [["tool1", "tool2"], ] for sequential chains
- tools: array of objects [{ toolId: string (maps to the complete tool name), parameters: object (can be nested. do not use javascript functions), dependsOn: array of prior toolIds (for sequential)}] (empty if no tools fit)
- reason: string (why these tools/plan or why none)
If no tools match, return { plan: "none", tools: [], reason: "No suitable tools found" }.
For sequential, use placeholders in parameters for dependencies, e.g., "{prevToolId.output}" for the entire output object, or "{prevToolId.output.path.to.key}" for nested values. Leverage output schemas to ensure compatibility.
`; */

  // V2: 09012026: Addresses tool calls with the same name within a given mcp server
  static ToolSelectorPrompt = (query, tools) => `
Given the user query: "${query}"
And available MCP tools (with output schemas): ${JSON.stringify(tools, null, 2)}
Plan and select one or more tools to handle the query. To be able to distinguish each unique tool, append a unique string '|tool-{No}' to each toolId.  To ensure each toolId is unique, replace '{No}' with a unique number such as 1, 2, 3 ...
Return a JSON object with:
- plan: string ("parallel") for concurrent invocation, Or JSON Array of sequences like [["tool1", "tool2"], ] for sequential chains
- tools: array of objects [{ toolId: string (maps to the complete tool name), parameters: object (can be nested. do not use javascript functions), dependsOn: array of prior toolIds (for sequential)}] (empty if no tools fit)
- reason: string (why these tools/plan or why none)
If no tools match, return { plan: "none", tools: [], reason: "No suitable tools found" }.
For sequential, use placeholders in parameters for dependencies, e.g., "{prevToolId.output}" for the entire output object, or "{prevToolId.output.path.to.key}" for nested values. Leverage output schemas to ensure compatibility.
`;

  // V3: 09162026: Addresses 1..Many loops. For instance, fetch product & inventory information for a sales/purchase order with multiple order lines.
  // Use this only if needed and other tools to retrieve the data doesn't exist.
  /* static ToolSelectorPrompt = (query, tools) => `
Given the user query: "${query}"
And available MCP tools (with output schemas): ${JSON.stringify(tools, null, 2)}

Plan and select one or more tools to handle the query. To be able to distinguish each unique tool, append a unique string '|tool-{No}' to each toolId. To ensure each toolId is unique, replace '{No}' with a unique number such as 1, 2, 3...

Return a JSON object with:
- plan: string ("parallel") for concurrent invocation, Or JSON Array of sequences like [["tool1", "tool2"], ] for sequential chains.
- tools: array of objects:
    {
      "toolId": string (maps to the complete tool name),
      "parameters": object (can be nested),
      "dependsOn": array of prior toolIds (for sequential),
      "forEach": object (OPTIONAL. Use this only when a tool must be executed iteratively for each item in a dynamic array returned by a prior tool. Contains properties:
        - "items": string (placeholder pointing to the array in the dependency tool's output, e.g., "{prevToolId.output.itemsField}")
        - "itemPlaceholder": string (a custom name for an item in the array to use as a variable, e.g., "item" or "lineItem")
      )
    }
- reason: string (why these tools/plan or why none)

Rules for Parameters & Placeholders:
1. For sequential, use placeholders in parameters for dependencies, e.g., "{prevToolId.output}" for the entire output object, or "{prevToolId.output.path.to.key}" for nested values. Leverage output schemas to ensure compatibility.
2. For dynamic loops utilizing "forEach", map the parameters using the "itemPlaceholder" defined, e.g., "{lineItem.productId}".

If no tools match, return { plan: "none", tools: [], reason: "No suitable tools found" }.
`; */

  // Synthesize prompt for final response
  static SynthesizePrompt = (query, toolResults) => `
Using these tool results (JSON):
\`\`\`json
${JSON.stringify(toolResults, null, 2)}
\`\`\`

Generate a concise, final response to the user query:
"${query}"
`;

  /**
   * Constructor for the Remote Tool Planner and Executor class.
   * Initializes necessary properties and dependencies for planning and executing remote tool invocations.
   *
   * @param {String} serverName Unique ID of this server
   * @param {String} appId AI Application ID
   * @param {String} aiAppRemoteServerConfig Remote Server configuration object defined at the AI App level
   * @param {Object} remoteServerConfig Remote Servers Configuration Object
   * @param {Object} epMetricsInfo - Endpoint metrics information for the AI Application used for logging API call metrics.
   * @param {Object} endpointsInfo - The list of all endpoints configured for the AI App, used for tool execution context.
   * @param {String} appType - The type of planner AI Application, which may influence tool selection and execution logic.
   * @param {String} mcpBridges - [{ serverId: "xyz", "bridge": mcpBridgeObject}, ...]
   */
  constructor(serverName, appId, aiAppRemoteServerConfig, remoteServerConfig, epMetricsInfo, endpointsInfo, appType, mcpBridges) {
    // Initialize any necessary properties here
    this.serverName = serverName;
    this.instanceName = process.env.POD_NAME || process.env.CONTAINER_APP_REPLICA_NAME || null; // Unique instance name of the pod or container app replica (or null)
    this.appId = appId;
    this.aiAppRemoteServerConfig = aiAppRemoteServerConfig;
    this.remoteServerConfig = remoteServerConfig;

    this.epMetricsInfo = epMetricsInfo;
    this.endpointsInfo = endpointsInfo;

    this.appType = appType; // IMP: This is the app type of the planner Ai App!
    this.mcpBridges = mcpBridges;

    this.toolSeqId = 1; // Initialize tool execution sequence id
  }

  // Enhanced dependency resolution: Recursively replace placeholders
  // V0
  #resolveParameters(parameters, toolResults) {
    if (typeof parameters !== 'object' || parameters === null) {
      return parameters;
    }

    if (Array.isArray(parameters)) {
      return parameters.map(item => this.#resolveParameters(item, toolResults));
    }

    return Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => {
        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
          const placeholder = value.slice(1, -1);
          // Get the toolId and path from the placeholder.
          // Eg., supply-chain-mgmt-server|sc.find_fulfillment_options.output.options[0].totalWeightKg
          // In this case, toolId = "supply-chain-mgmt-server|sc.find_fulfillment_options" and path = "output.options[0].totalWeightKg"
          // toolId comprises of the serverId and toolName separated by '|'.  The toolName may or may not have a namespace prefix based on 
          // how the MCP Server Tools class defines it. The path can be used to resolve nested output referencing based on the tool 
          // output schema.
          const toolId = placeholder.substring(0, placeholder.indexOf('.output')); // Get the substring until '.output' as the toolId
          const pathStr = placeholder.substring(placeholder.indexOf('.output') + 1); // Get the substring after '.output' as the path string
          // (2) console.log("******** Resolving parameters for tool:", { placeholder, toolId, pathStr }); // Debug log to check the parameter resolution process
          const [...pathParts] = pathStr.split('.');

          // const [toolId, ...pathParts] = placeholder.split('.');
          if (pathParts[0] === 'output') {
            let resolved = toolResults[toolId]; // ?.result;
            // (3) console.log("******** Initial resolved value for toolId:", { toolId, resolved }); // Debug log to check the initial resolved value based on the toolId
            for (const part of pathParts.slice(1)) { // Skip the first 'output' part
              // resolved = resolved?.[part];
              // if part is an array index like options[0], we need to handle it accordingly
              if (part.endsWith(']')) {
                // Check for both array index and wildcard referencing in the same regex. This allows for more flexible referencing in the prompt, 
                // supporting both specific index access and entire array retrieval.
                const arrayMatch = part.match(/(\w+)\[(\d+|\*)\]/);
                if (arrayMatch) {
                  const arrayKey = arrayMatch[1];
                  // If array index is '*', we can return the entire array for that key. This allows for more flexible referencing in the prompt.
                  if (arrayMatch[2] === '*') {
                    resolved = resolved?.[arrayKey];
                    // (4) console.log("******** Resolving entire array for key:", { arrayKey, resolved }); // Debug log to check the resolution of entire array for the key
                    continue; // No need to continue further as we want the entire array
                  };

                  const arrayIndex = parseInt(arrayMatch[2], 10);
                  resolved = resolved?.[arrayKey]?.[arrayIndex];
                }
                else {
                  resolved = resolved?.[part];
                }
              }
              else {
                // if resolved is an array of objects and part is a key that exists in the objects, we can map over the array to get an array of 
                // values for that key. This allows for more flexible referencing in the prompt.
                if (Array.isArray(resolved) && resolved.every(item => typeof item === 'object' && item !== null && part in item)) {
                  resolved = resolved.map(item => item[part]);
                }
                else {
                  resolved = resolved[part];
                };
              };
              // (5) console.log("******** Resolving path part:", { part, resolved }); // Debug log to check the resolution of each path part
            };
            return [key, resolved ?? value];
          };
        }
        else if (typeof value === 'object') {
          return [key, this.#resolveParameters(value, toolResults)];
        };

        return [key, value];
      })
    );
  }

  // V3: 09162026: Adds looping to retrieve values from dependent tools
  /* #resolveParameters(parameters, toolResults, currentIteration = null) {
    if (typeof parameters !== 'object' || parameters === null) {
      return parameters;
    };

    if (Array.isArray(parameters)) {
      return parameters.map(item => this.#resolveParameters(item, toolResults, currentIteration));
    };

    return Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => {
        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
          const placeholder = value.slice(1, -1);

          // --- FOR-EACH DYNAMIC ITEM RESOLUTION ---
          // Check if we are inside a loop iteration and the placeholder starts with our defined item placeholder
          if (currentIteration && placeholder.startsWith(`${currentIteration.placeholder}.`)) {
            const pathStr = placeholder.substring(currentIteration.placeholder.length + 1); // Extract sub-path (e.g., "sku")
            const pathParts = pathStr.split('.');
            let resolved = currentIteration.item;

            for (const part of pathParts) {
              resolved = resolved?.[part];
            }
            return [key, resolved ?? value];
          }

          // --- STANDARD TOOL OUTPUT RESOLUTION ---
          const toolId = placeholder.substring(0, placeholder.indexOf('.output'));
          const pathStr = placeholder.substring(placeholder.indexOf('.output') + 1);
          const [...pathParts] = pathStr.split('.');

          if (pathParts[0] === 'output') {
            let resolved = toolResults[toolId];
            for (const part of pathParts.slice(1)) {
              if (part.endsWith(']')) {
                const arrayMatch = part.match(/(\w+)\[(\d+|\*)\]/);
                if (arrayMatch) {
                  const arrayKey = arrayMatch[1];
                  if (arrayMatch[2] === '*') {
                    resolved = resolved?.[arrayKey];
                    continue;
                  };
                  const arrayIndex = parseInt(arrayMatch[2], 10);
                  resolved = resolved?.[arrayKey]?.[arrayIndex];
                }
                else {
                  resolved = resolved?.[part];
                }
              }
              else {
                if (Array.isArray(resolved) && resolved.every(item => typeof item === 'object' && item !== null && part in item)) {
                  resolved = resolved.map(item => item[part]);
                }
                else {
                  resolved = resolved[part];
                };
              };
            };
            return [key, resolved ?? value];
          };
        }
        else if (typeof value === 'object') {
          return [key, this.#resolveParameters(value, toolResults, currentIteration)];
        };

        return [key, value];
      })
    );
  }

  // Works
  // Fixes: Scalar value substitution
  #resolveParameters(parameters, toolResults, currentIteration = null) {
    if (typeof parameters !== 'object' || parameters === null) {
      return parameters;
    }

    if (Array.isArray(parameters)) {
      return parameters.map(item => this.#resolveParameters(item, toolResults, currentIteration));
    }

    return Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => {
        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
          const placeholder = value.slice(1, -1);

          // --- FOR-EACH DYNAMIC ITEM RESOLUTION ---
          if (currentIteration) {
            // Fix 1: Handle primitive loop variables directly (e.g., "{accountId}")
            if (placeholder === currentIteration.placeholder) {
              return [key, currentIteration.item];
            }

            // Fix 2: Handle nested object path keys safely (e.g., "{lineItem.sku}")
            if (placeholder.startsWith(`${currentIteration.placeholder}.`)) {
              const pathStr = placeholder.substring(currentIteration.placeholder.length + 1);
              const pathParts = pathStr.split('.');
              let resolved = currentIteration.item;

              for (const part of pathParts) {
                resolved = resolved?.[part];
              }
              return [key, resolved ?? value];
            }
          };

          // --- STANDARD TOOL OUTPUT RESOLUTION ---
          const outputIndex = placeholder.indexOf('.output');
          if (outputIndex !== -1) {
            const toolId = placeholder.substring(0, placeholder.indexOf('.output'));
            const pathStr = placeholder.substring(placeholder.indexOf('.output') + 1);
            const [...pathParts] = pathStr.split('.');

            if (pathParts[0] === 'output') {
              let resolved = toolResults[toolId];
              for (const part of pathParts.slice(1)) {
                if (part.endsWith(']')) {
                  const arrayMatch = part.match(/(\w+)\[(\d+|\*)\]/);
                  if (arrayMatch) {
                    const arrayKey = arrayMatch[1];
                    if (arrayMatch[2] === '*') {
                      resolved = resolved?.[arrayKey];
                      continue;
                    };
                    const arrayIndex = parseInt(arrayMatch[2], 10);
                    resolved = resolved?.[arrayKey]?.[arrayIndex];
                  }
                  else {
                    resolved = resolved?.[part];
                  }
                }
                else {
                  if (Array.isArray(resolved) && resolved.every(item => typeof item === 'object' && item !== null && part in item)) {
                    resolved = resolved.map(item => item[part]);
                  }
                  else {
                    resolved = resolved?.[part];
                  };
                };
              };
              return [key, resolved ?? value];
            };
          }
        } else if (typeof value === 'object') {
          return [key, this.#resolveParameters(value, toolResults, currentIteration)];
        }

        return [key, value];
      })
    );
  }

  // Fixes: Negative numerical value resolution
  #resolveParameters(parameters, toolResults, currentIteration = null) {
    if (typeof parameters !== 'object' || parameters === null) {
      return parameters;
    }

    if (Array.isArray(parameters)) {
      return parameters.map(item => this.#resolveParameters(item, toolResults, currentIteration));
    }

    return Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => {
        if (typeof value === 'string') {
          // Check if the string represents a standard or negative placeholder
          const isNegative = value.startsWith('-{') && value.endsWith('}');
          const isPositive = value.startsWith('{') && value.endsWith('}');

          if (isPositive || isNegative) {
            // Extract the clean placeholder inside the brackets
            const placeholder = isNegative ? value.slice(2, -1) : value.slice(1, -1);
            let resolved = undefined;
            let found = false;

            // --- FOR-EACH DYNAMIC ITEM RESOLUTION ---
            if (currentIteration) {
              if (placeholder === currentIteration.placeholder) {
                resolved = currentIteration.item;
                found = true;
              } 
              else if (placeholder.startsWith(`${currentIteration.placeholder}.`)) {
                const pathStr = placeholder.substring(currentIteration.placeholder.length + 1);
                const pathParts = pathStr.split('.');
                resolved = currentIteration.item;
                for (const part of pathParts) {
                  resolved = resolved?.[part];
                }
                found = true;
              }
            };

            // --- STANDARD TOOL OUTPUT RESOLUTION ---
            if (!found && placeholder.includes('.output')) {
              const toolId = placeholder.substring(0, placeholder.indexOf('.output'));
              const pathStr = placeholder.substring(placeholder.indexOf('.output') + 1);
              const [...pathParts] = pathStr.split('.');

              if (pathParts[0] === 'output') {
                resolved = toolResults[toolId];
                for (const part of pathParts.slice(1)) {
                  if (part.endsWith(']')) {
                    const arrayMatch = part.match(/(\w+)\[(\d+|\*)\]/);
                    if (arrayMatch) {
                      const arrayKey = arrayMatch[1];
                      if (arrayMatch[2] === '*') {
                        resolved = resolved?.[arrayKey];
                        continue;
                      }
                      const arrayIndex = parseInt(arrayMatch[2], 10);
                      resolved = resolved?.[arrayKey]?.[arrayIndex];
                    } else {
                      resolved = resolved?.[part];
                    }
                  } 
                  else {
                    if (Array.isArray(resolved) && resolved.every(item => typeof item === 'object' && item !== null && part in item)) {
                      resolved = resolved.map(item => item[part]);
                    } else {
                      resolved = resolved?.[part];
                    }
                  }
                };
                found = true;
              };
            };

            // --- APPLY SIGN CORRECTION AND RETURN ---
            if (found && resolved !== undefined) {
              if (isNegative) {
                const numValue = Number(resolved);
                // Fallback to original string expression if conversion results in NaN
                return [key, isNaN(numValue) ? value : -numValue];
              }
              return [key, resolved];
            };

            return [key, value];
          }
        } else if (typeof value === 'object') {
          return [key, this.#resolveParameters(value, toolResults, currentIteration)];
        }

        return [key, value];
      })
    );
  } */

  /**
   * This method extracts the last user message from the request context, which can be used as input for MCP tool planning.
   * 
   * @param {Array} messages The messages array from the request context.
   * @return {String} The content of the last user message, or an empty string if no user message is found.
   */
  #getLastUserMessage(messages) { // Private method to extract the last user message from the messages array
    let lastUserMessage = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === MessageRoleTypes.User.toLocaleLowerCase()) {
        lastUserMessage = messages[i].content || "";
        break;
      };
    };

    return lastUserMessage;
  }

  /**
   * This method updates the messages array in the request context (last message) with the outputs from the executed tools, which can then be used for context building in the LLM prompt.
   * 
   * @param {Object} requestContext OpenAI request context containing the conversation history and user input/prompt.
   * @param {Object} toolResults The results from the executed tools, which is an object based on the tool output schema. This will be appended to the last user message for context building in the LLM prompt.
   * @return {Array} The updated messages array with the tool outputs included in the last user message for context building in the LLM prompt.
   */
  #updateMessagesWithToolOutputs(requestContext, toolResults) { // Private method to update the messages array with tool output for context building
    let updatedMessages = [...requestContext.messages];

    // First retrieve the last message from the request context. Update the last user message with the tool response for context building in the LLM prompt.
    const lastMessageIndex = updatedMessages.length - 1;
    const lastUserMessage = updatedMessages[lastMessageIndex];
    let userMessage = updatedMessages[lastMessageIndex];
    if (userMessage.role === MessageRoleTypes.User.toLocaleLowerCase())
      userMessage.content = ToolPlannerExecutorV0.SynthesizePrompt(lastUserMessage.content, toolResults);

    return updatedMessages;
  }

  /**
   * Invoke a remote server tool. It constructs the request based on the tool definition and parameters, 
   * sends the request to the appropriate server, and handles the response. It also includes error handling to catch and 
   * log any issues during the tool invocation process, returning a structured response indicating success or failure of the tool call.
   * 
   * @param request AI Gateway (HTTP) Request object
   * @param threadId The thread id of current request
   * @param {object} srvTool An object containing the toolId (in the format "serverId|toolName") and parameters for the tool invocation. 
   * The parameters can be of any type based on the tool's input schema, and can include placeholders for dependencies on other tools' outputs.
   * @returns {object} { toolId: string, result: any, success: boolean, error?: string }
   * - toolId: The ID of the tool that was invoked, in the format "serverId|toolName".
   * - result: The output/result returned from the tool invocation, which can be of any type based on the tool's output schema.
   * - success: A boolean indicating whether the tool invocation was successful or not.
   * - error: An optional string containing the error message if the tool invocation failed, included only when success is false.
   */
  async #invokeRemoteTool(request, threadId, srvTool) {
    // Extract the server id from the toolId (format: "serverId|toolName|toolNo")
    const [serverId, toolName, toolNo] = srvTool.toolId.split("|");
    const remoteServer = this.remoteServerConfig.find(srv => srv.id === serverId);
    let toolResponse;

    let sessionId = request.get(CustomRequestHeaders.SessionId);
    if (sessionId)
      sendTrace(sessionId, `Invoking Tool: <b>${toolName}</b> on Server: <b>${serverId}</b>`);

    let stTime = Date.now();
    try {
      if (!remoteServer)
        throw new Error(`Remote Server with ID ${serverId} not found for tool ${toolName}`);

      logger.log({ level: "debug", message: "[%s] %s.#invokeRemoteTool(): Invoking remote tool.\n  Request ID: %s\n  Server ID: %s\n  Tool ID: %s\n  Tool No: %s\n  Parameters: %s", splat: [scriptName, this.constructor.name, request.id, serverId, toolName, toolNo, JSON.stringify(srvTool.parameters, null, 2)] });

      let headers = {};
      let srvResponse;
      switch (remoteServer.protocol) {
        case RemoteServerProtocol.Mcp:
          headers[CustomRequestHeaders.RequestId] = request.id;
          if (remoteServer.auth.authType === McpServerAuthTypes.ApiKey)
            headers[remoteServer.auth.keyName] = remoteServer.auth.keyValue;

          srvResponse = await getMcpServerResponse({
            endpointUrl: remoteServer.uri,
            method: McpMethods.TOOLS_CALL,
            headers,
            params: {
              name: toolName,
              arguments: srvTool.parameters
            }
          });

          // console.log(`**** Remote tool response: ****\n${JSON.stringify(srvResponse, null, 2)}`);
          let callResult = null;
          let callError = null;
          if (!srvResponse.result?.structuredContent) {
            try {
              callResult = JSON.parse(srvResponse.result?.content[0]?.text);
            }
            catch (e) {
              callError = `Parse error: ${e.message}; Error text: ${srvResponse.result?.content[0]?.text}`;
            };
          };
          toolResponse = {
            toolId: srvTool.toolId,
            // result: srvResponse.result?.content[0]?.text, // Only type = "text" is supported for now, can be enhanced to support other types and richer response structures based on the tool output schema
            // result: (srvResponse.result?.structuredContent) ? JSON.stringify(srvResponse.result.structuredContent) : srvResponse.result?.content[0]?.text, // type = text and structuredContent supported
            result: (srvResponse.result?.structuredContent) ? JSON.stringify(srvResponse.result.structuredContent) : (callResult ? srvResponse.result?.content[0]?.text : null),
            ...(callError && { error: callError }),
            success: (callError) ? false : true
          };

          // console.log(`**** Result of Tool Call ****\n${JSON.stringify(toolResponse, null, 2)}`);
          break;
        case RemoteServerProtocol.A2A:
          srvResponse = await this.mcpBridges.find(bridge => bridge.serverId === serverId).bridge.invoke(request.id, toolName, srvTool.parameters, { contextId: threadId, requestId: request.id });

          if (srvResponse.isError)
            throw new Error(srvResponse.content[0].text);

          toolResponse = {
            toolId: srvTool.toolId,
            result: (srvResponse) ? JSON.stringify(srvResponse) : null, // Convert the a2a agent response into a string
            success: true
          };
          break;
        case RemoteServerProtocol.WebAPI:
        case RemoteServerProtocol.gRPC:
          headers[CustomRequestHeaders.RequestId] = request.id;
          srvResponse = await this.mcpBridges.find(bridge => bridge.serverId === serverId).bridge.invoke(request.id, toolName, srvTool.parameters, headers);

          toolResponse = {
            toolId: srvTool.toolId,
            result: (srvResponse) ? JSON.stringify(srvResponse) : null, // Convert the web api / grpc server response into a string
            success: true
          };
          break;
        default:
          throw new Error(`Remote server protocol: ${remoteServer.protocol}, not supported!`);
      };

      logger.log({ level: "debug", message: "[%s] %s.#invokeRemoteTool(): Remote tool execution completed OK.\n  Request ID: %s\n  Result: %s", splat: [scriptName, this.constructor.name, request.id, JSON.stringify(toolResponse, null, 2)] });
    }
    catch (error) {
      toolResponse = {
        toolId: srvTool.toolId,
        result: null,
        success: false,
        error: `${error.message}; Reason: ${error.bodyText ?? ''}`
      };

      logger.log({ level: "warn", message: "[%s] %s.#invokeRemoteTool(): Remote tool execution failed.\n  Request ID: %s\n  Server|Tool ID: %s\n  Error: %s", splat: [scriptName, this.constructor.name, request.id, srvTool.toolId, toolResponse.error] });

      if (sessionId)
        sendError(sessionId, `Tool invocation failed. Error: ${toolResponse.error}`);
    };

    // Persist the tool execution details in table 'toolexecdetails'
    let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
    if (persistPrompts) { // Persist prompt, completion, tool plan and tool call details ?
      const toolDetailsDao = new PersistDao(persistdb, TblNames.ToolExecDetails);
      const values = [
        this.serverName,
        this.instanceName,
        request.id,
        threadId,
        this.appId,
        this.toolSeqId++,
        remoteServer.protocol,
        remoteServer.uri,
        serverId,
        toolName,
        null,
        srvTool.parameters,
        toolResponse.result,
        (toolResponse.success) ? null : toolResponse.error,
        (toolResponse.success) ? DocProcessorStatus.Completed : DocProcessorStatus.Failed,
        (Date.now() - stTime) / 1000,
        request.body.user
      ];

      // console.log(`***** Tool Exec Plan Details:\n  ${JSON.stringify(values)}\n*****`);

      await toolDetailsDao.storeEntity(request.id, 0, values);
    };

    return (toolResponse);
  }

  /**
   * This method plans and executes remote tool invocations based on the provided tool definitions and request context.
   * It returns the aggregated message context from all tool executions to be included in the LLM prompt.
   *
   * @param {Object} request - The current request context containing the conversation history and user input, used for tool planning and execution.
   * @param {String} threadId - The thread id of current request
   * @param {Array} toolDefinitions - An array of tool definitions fetched from the Remote Server Tools class.
   * @param {Array} normsConfig - Normalizations (array) configured for the Ai App. 
   * @returns {Number} - No of tools to be executed, generated by the planner.
   */
  async planAndExecuteTools(request, threadId, toolDefinitions, normsConfig) {
    let execToolCount = 0;
    let sessionId = request.get(CustomRequestHeaders.SessionId);

    try {
      const query = this.#getLastUserMessage(request.body.messages);
      if (!query) {
        logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  No user message found in request context, skipping tool planning and execution.", splat: [scriptName, this.constructor.name, request.id] });

        return (execToolCount); // No user message found, skip tool planning and execution
      };

      if (sessionId)
        sendStatus(sessionId, "🧩 Preparing tool execution plan...");

      // const modelMessages = (request.body.messages || []).map(msg => ({ role: msg.role, content: msg.content }));
      let modelMessages;
      let systemMsg;
      if (this.appType === AzAiServices.Anthropic) {
        systemMsg = (request.body.messages || []).find(msg => msg.role === OpenAIChatCompletionMsgRoleTypes.SystemMessage);

        modelMessages = (request.body.messages || [])
          .filter((msg) => msg.role !== OpenAIChatCompletionMsgRoleTypes.SystemMessage) // strip the 'system' message
          .map((msg) => ({ role: msg.role, content: msg.content }));
      }
      else // appType = OAI
        modelMessages = (request.body.messages || []).map(msg => ({ role: msg.role, content: msg.content }));

      modelMessages.pop(); // Remove the last user message as it will be included in the tool planning prompt
      modelMessages.push({ // Add the tool planning prompt as the last user message for tool selection and planning
        "role": MessageRoleTypes.User.toLocaleLowerCase(),
        "content": ToolPlannerExecutorV0.ToolSelectorPrompt(query, toolDefinitions)
      }); // Add the tool planning prompt as the last user message for tool selection and planning

      if (this.appType === AzAiServices.Anthropic) // Use prompt pre-filling to force generation of JSON tool execution plan
        modelMessages.push({
          "role": MessageRoleTypes.Assistant.toLocaleLowerCase(),
          "content": "{"
        });

      const toolsMessage = {
        "model": this.aiAppRemoteServerConfig.plannerModel,
        ...((this.appType === AzAiServices.Anthropic) && systemMsg && { "system": systemMsg.content }),
        "messages": modelMessages,
        ...((this.appType === AzAiServices.OAI) && { "response_format": { "type": "json_object" } }),
        "temperature": this.aiAppRemoteServerConfig.plannerTemperature || 0.3,
        ...((this.appType === AzAiServices.OAI) && { "max_completion_tokens": this.aiAppRemoteServerConfig.plannerMaxTokens || 1000 }),
        ...((this.appType === AzAiServices.Anthropic) && { "max_tokens": this.aiAppRemoteServerConfig.plannerMaxTokens || 1000 })
        // "max_completion_tokens": this.aiAppRemoteServerConfig.plannerMaxTokens || 1000
      };  // User message with tool definitions and selection prompt

      let stTime = Date.now();
      // LLM selects tools and plan
      const selectionCompletion = await helper.callAiAppEndpoint(request, this.epMetricsInfo, this.endpointsInfo, toolsMessage, this.appType, normsConfig);
      const execTime = (Date.now() - stTime) / 1000;
      // console.log("******** Tool selection completion from planner model:", JSON.stringify(selectionCompletion, null, 2)); // Debug log to check the tool selection completion response

      if (!selectionCompletion || selectionCompletion === null) return; // No response from the planner model, skip tool execution

      const toolPlan = (this.appType === AzAiServices.OAI) ? JSON.parse(selectionCompletion.choices[0].message.content) : JSON.parse("{" + selectionCompletion.content[0].text);
      logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  Prompt/Query: %s\n  Tool Plan:\n  %s", splat: [scriptName, this.constructor.name, request.id, query, JSON.stringify(toolPlan, null, 2)] });

      if (toolPlan.tools.length > this.aiAppRemoteServerConfig.maxToolsPerQuery)
        throw new Error(`Too many tools selected (${toolPlan.tools.length}); configured limit is ${this.aiAppRemoteServerConfig.maxToolsPerQuery}`);

      if (!toolPlan.tools.length) {
        if (sessionId)
          sendStatus(sessionId, "⏭️ No tools identified, skipping execution...");

        return (execToolCount); // No tools selected, proceed with original query processing
      }
      else
        execToolCount = toolPlan.tools.length; // Set the tools count

      // Tokens counts
      const promptTokens = ((this.appType === AzAiServices.OAI) ? selectionCompletion.usage.prompt_tokens : selectionCompletion.usage.input_tokens) || 0;
      const completionTokens = ((this.appType === AzAiServices.OAI) ? selectionCompletion.usage.completion_tokens : selectionCompletion.usage.output_tokens) || 0;
      const cacheReadTokens = ((this.appType === AzAiServices.OAI) ? selectionCompletion.usage.prompt_tokens_details?.cached_tokens : selectionCompletion.usage.cache_read_input_tokens) || 0;
      const cacheWriteTokens = ((this.appType === AzAiServices.OAI) ? selectionCompletion.usage.prompt_tokens_details?.cache_write_tokens : selectionCompletion.usage.cache_creation_input_tokens) || 0;

      // Persist the tool execution plan in table 'toolexecplan'
      let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
      if (persistPrompts) { // Persist prompt, completion, tool plan and tool call details ?
        const toolPlanDao = new PersistDao(persistdb, TblNames.ToolExecPlan);
        const values = [
          this.serverName,
          this.instanceName,
          ToolPlannerTypes.Version0,
          request.id,
          threadId,
          this.appId,
          this.aiAppRemoteServerConfig.aiAppName || this.appId,
          this.aiAppRemoteServerConfig.plannerModel,
          toolsMessage,
          toolPlan,
          toolDefinitions.length,
          selectionCompletion.imetadata?.responseHdrs,
          completionTokens,
          promptTokens,
          cacheReadTokens,
          cacheWriteTokens,
          execTime,
          selectionCompletion.imetadata?.endpointId,
          request.body.user
        ];

        await toolPlanDao.storeEntity(request.id, 0, values);
      };

      if (sessionId)
        sendStatus(sessionId, "⚙️ Executing tools...");

      // Invoke tools based on plan
      let toolResults = {};
      if (toolPlan.plan === McpToolExecutionTypes.ParallelExecution) {
        const invocations = await Promise.all(toolPlan.tools.map(async (tool) => await this.#invokeRemoteTool(request, threadId, tool)));
        invocations.forEach(inv => { toolResults[inv.toolId] = JSON.parse(inv.result) || null; });
      }
      /* else if (Array.isArray(toolPlan.plan)) {
        for (const sequence of toolPlan.plan) {
          for (const toolId of sequence) {
            if (toolResults[toolId]) // tool already processed?
              continue;

            const tool = toolPlan.tools.find(t => t.toolId === toolId);

            // --- HANDLE DYNAMIC FOR-EACH LOOPS ---
            if (tool.forEach && tool.forEach.items) {
              // Step A: Extract the structural array path from the placeholder string (e.g. "{tool-1.output.orderLines}")
              const arrayPlaceholder = {
                // Inject a temporary wrapper key so our native resolver can find it easily
                targetArray: tool.forEach.items
              };
              const resolvedArrayObj = this.#resolveParameters(arrayPlaceholder, toolResults);
              const loopItems = resolvedArrayObj.targetArray;

              // Verify that the path actually yielded an array
              if (Array.isArray(loopItems)) {
                // Process all elements in parallel
                const iterationPromises = loopItems.map(async (item) => {
                  // Deep clone parameters so modifications do not bleed into parallel instances
                  const iterationParams = JSON.parse(JSON.stringify(tool.parameters));

                  // Build the iteration bundle tracker
                  const currentIteration = {
                    placeholder: tool.forEach.itemPlaceholder, // e.g., "lineItem"
                    item: item                                  // The raw object iteration block
                  };

                  // Fully resolve standard global dependencies AND iteration dependencies
                  const resolvedParams = this.#resolveParameters(iterationParams, toolResults, currentIteration);

                  // Reconstruct a specific isolated execution tool configuration for the runtime harness
                  const localizedToolInstance = {
                    ...tool,
                    parameters: resolvedParams
                  };

                  const itemResult = await this.#invokeRemoteTool(request, threadId, localizedToolInstance);
                  return JSON.parse(itemResult.result) || null;
                });

                // Wait for all elements to execute, storing the collective matrix under the master toolId
                toolResults[toolId] = await Promise.all(iterationPromises);
              }
              else {
                // Fallback if the target path was empty or resolved to an invalid schema object
                toolResults[toolId] = [];
              };
            }
            else {
              // --- STANDARD TOOL EXECUTION (ORIGINAL LOGIC) ---
              if (tool.dependsOn?.length) {
                tool.parameters = this.#resolveParameters(tool.parameters, toolResults);
              };

              const result = await this.#invokeRemoteTool(request, threadId, tool);
              toolResults[toolId] = JSON.parse(result.result) || null;
            };
          };
        };
      } */
      else if (Array.isArray(toolPlan.plan)) {
        for (const sequence of toolPlan.plan) {
          for (const toolId of sequence) {
            if (toolResults[toolId]) // tool already processed?
              continue;

            const tool = toolPlan.tools.find(t => t.toolId === toolId);

            if (tool.dependsOn?.length) {
              tool.parameters = this.#resolveParameters(tool.parameters, toolResults);
            };

            const result = await this.#invokeRemoteTool(request, threadId, tool);
            toolResults[toolId] = JSON.parse(result.result) || null; // Store the parsed result based on the tool output schema. If parsing fails, store null.
            // (1) console.log("******** Tool execution result for toolId:", { toolResults }); // Debug log to check the tool execution result after each tool invocation in sequential execution
          };
        };
      }
      else
        throw new Error(`Invalid or unsupported plan type: ${toolPlan.Plan}`);

      logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools(): Finished tool execution.\n  Request ID: %s\n  Results: %s", splat: [scriptName, this.constructor.name, request.id, JSON.stringify(toolResults, null, 2)] });
      request.body.messages = this.#updateMessagesWithToolOutputs(request.body, toolResults);
    }
    catch (error) {
      execToolCount = 0;

      if (sessionId)
        sendError(sessionId, `Error executing tool plan. Error: ${error.message}`);

      logger.log({ level: "warn", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  Error executing plan: %s", splat: [scriptName, this.constructor.name, request.id, error.message] });
    };

    return (execToolCount);
  }
} // End of ToolPlannerExecutorV0 class

module.exports = {
  ToolPlannerExecutorV0
};