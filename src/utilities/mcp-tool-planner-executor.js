/**
 * Name: MCP tool planner and executor class
 * Description: This class is responsible for planning and executing MCP tool invocations as part of the inference processing pipeline.
 * It interacts with the MCP Server Tools class to fetch tool definitions and execute them to gather supplemental context for LLM responses.
 * 
 * Important: This class is not used!
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-26-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger.js');
const {
  MessageRoleTypes,
  McpMethods,
  McpToolExecutionTypes,
  McpServerAuthTypes
} = require("./app-gtwy-constants.js");
const helper = require("./helper-funcs.js");
const { getMcpServerResponse } = require("./mcp-client.js");

class McpToolPlannerExecutor {

  // Enhanced LLM prompt for multi-tool selection and planning
  static ToolSelectorPrompt = (query, tools) => `
Given the user query: "${query}"
And available MCP tools (with output schemas): ${JSON.stringify(tools, null, 2)}
Plan and select one or more tools to handle the query. Return a JSON object with:
- plan: string ("parallel") for concurrent invocation, Or JSON Array of sequences like [["tool1", "tool2"]] for sequential chains
- tools: array of objects [{ toolId: string (maps to the complete tool name), parameters: object (can be nested. do not use javascript functions), dependsOn: array of prior toolIds (for sequential)}] (empty if no tools fit)
- reason: string (why these tools/plan or why none)
If no tools match, return { plan: "none", tools: [], reason: "No suitable tools found" }.
For sequential, use placeholders in parameters for dependencies, e.g., "{prevToolId.output}" for the entire output object, or "{prevToolId.output.path.to.key}" for nested values. Leverage output schemas to ensure compatibility.
`;

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
   * Constructor for the MCP Tool Planner and Executor class.
   * Initializes necessary properties and dependencies for planning and executing MCP tool invocations.
   *
   * @param {String} aiAppMcpServerConfig MCP Server configuration object defined at the AI App level
   * @param {Object} mcpServerConfig MCP Server Configuration Object
   * @param {Object} epMetricsInfo - Endpoint metrics information for the AI Application used for logging API call metrics.
   * @param {Object} endpointsInfo - The list of all endpoints configured for the AI App, used for tool execution context.
   * @param {String} appType - The type of AI Application, which may influence tool selection and execution logic.
   */
  constructor(aiAppMcpServerConfig, mcpServerConfig, epMetricsInfo, endpointsInfo, appType) {
    // Initialize any necessary properties here

    this.aiAppMcpServerConfig = aiAppMcpServerConfig;
    this.mcpServerConfig = mcpServerConfig;

    this.epMetricsInfo = epMetricsInfo;
    this.endpointsInfo = endpointsInfo;

    this.appType = appType;
  }

  // Enhanced dependency resolution: Recursively replace placeholders
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
          console.log("******** Resolving parameters for tool:", { placeholder, toolId, pathStr }); // Debug log to check the parameter resolution process
          const [...pathParts] = pathStr.split('.');

          // const [toolId, ...pathParts] = placeholder.split('.');
          if (pathParts[0] === 'output') {
            let resolved = toolResults[toolId]; // ?.result;
            console.log("******** Initial resolved value for toolId:", { toolId, resolved }); // Debug log to check the initial resolved value based on the toolId
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
                    console.log("******** Resolving entire array for key:", { arrayKey, resolved }); // Debug log to check the resolution of entire array for the key
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
              console.log("******** Resolving path part:", { part, resolved }); // Debug log to check the resolution of each path part
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
      userMessage.content = McpToolPlannerExecutor.SynthesizePrompt(lastUserMessage.content, toolResults);

    return updatedMessages;
  }

  /**
   * Invoke a single MCP server tool using JSON-RPC tools/call method. It constructs the JSON-RPC request based on the tool definition and parameters, 
   * sends the request to the appropriate MCP server, and handles the response. It also includes error handling to catch and log any issues during the tool invocation process, 
   * returning a structured response indicating success or failure of the tool call.
   * 
   * @param {object} srvTool An object containing the toolId (in the format "serverId|toolName") and parameters for the tool invocation. 
   * The parameters can be of any type based on the tool's input schema, and can include placeholders for dependencies on other tools' outputs.
   * @returns {object} { toolId: string, result: any, success: boolean, error?: string }
   * - toolId: The ID of the tool that was invoked, in the format "serverId|toolName".
   * - result: The output/result returned from the tool invocation, which can be of any type based on the tool's output schema.
   * - success: A boolean indicating whether the tool invocation was successful or not.
   * - error: An optional string containing the error message if the tool invocation failed, included only when success is false.
   */
  async #invokeMcpTool(srvTool) {
    // Extract the server id from the toolId (format: "serverId|toolName")
    const [serverId, toolName] = srvTool.toolId.split("|");
    const mcpServer = this.mcpServerConfig.find(srv => srv.id === serverId);

    try {
      if (!mcpServer)
        throw new Error(`MCP Server with ID ${serverId} not found for tool ${toolName}`);

      /*
      const rpcRequest = {
        jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
        id: this.#nextRpcId(),
        method: McpMethods.TOOLS_CALL,
        params: {
          name: toolName,
          arguments: srvTool.parameters
        }
      };

      let headers = {
        [HttpHeaders.ContentType]: MimeTypes.Json,
        [HttpHeaders.Accept]: MimeTypes.Json
      };

      if (mcpServer.auth.authType === McpServerAuthTypes.ApiKey)
        headers[mcpServer.auth.keyName] = mcpServer.auth.keyValue;

      const response = await fetch(mcpServer.uri, {
        method: HttpMethods.POST,
        headers,
        body: JSON.stringify(rpcRequest)
      });

      if (!response.ok)
        throw new Error(`MCP Server ID: ${serverId}, Tool: ${toolName}, HTTP Status: ${response.status}, Error: ${response.statusText}`);
      */

      let headers = {};
      if (mcpServer.auth.authType === McpServerAuthTypes.ApiKey)
        headers[mcpServer.auth.keyName] = mcpServer.auth.keyValue;

      console.log("******** Invoking MCP tool with parameters:", { serverId, toolName, parameters: srvTool.parameters }); // Debug log to check the tool invocation parameters

      const rpcResponse = await getMcpServerResponse({
        endpointUrl: mcpServer.uri,
        method: McpMethods.TOOLS_CALL,
        headers,
        params: {
          name: toolName,
          arguments: srvTool.parameters
        }
      });

      // const rpcResponse = await response.json();

      /*
      if (rpcResponse.jsonrpc !== A2AProtocolAttributes.JsonRpcVersion || rpcResponse.id !== rpcRequest.id)
        throw new Error("Invalid JSON-RPC response format");

      if (rpcResponse.error)
        throw new Error(`MCP Server ID: ${serverId}, Tool: ${toolName}, Tool call failed: ${rpcResponse.error.message} (code: ${rpcResponse.error.code})`);
      */

      return {
        toolId: srvTool.toolId,
        result: rpcResponse.result?.content[0]?.text, // Only type = "text" is supported for now, can be enhanced to support other types and richer response structures based on the tool output schema
        success: true
      };
    }
    catch (error) {
      logger.log({ level: "warn", message: "[%s] %s.#invokeMcpTool(): Tool invocation failed for: %s\n  Error: %s", splat: [scriptName, this.constructor.name, srvTool.toolId, error.message] });

      return {
        toolId: srvTool.toolId,
        result: null,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * This method plans and executes MCP tool invocations based on the provided tool definitions and request context.
   * It returns the aggregated message context from all tool executions to be included in the LLM prompt.
   *
   * @param {Object} request - The current request context containing the conversation history and user input, used for tool planning and execution.
   * @param {Array} toolDefinitions - An array of tool definitions fetched from the MCP Server Tools class.
   * @returns {Array} - An aggregated message object (array) after execution of all tools.
   */
  async planAndExecuteTools(request, toolDefinitions) {
    try {
      const query = this.#getLastUserMessage(request.body.messages);
      if (!query) {
        logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  No user message found in request context, skipping tool planning and execution.", splat: [scriptName, this.constructor.name, request.id] });
        return; // No user message found, skip tool planning and execution
      };

      const modelMessages = (request.body.messages || []).map(msg => ({ role: msg.role, content: msg.content }));
      modelMessages.pop(); // Remove the last user message as it will be included in the tool planning prompt
      modelMessages.push({ // Add the tool planning prompt as the last user message for tool selection and planning
        "role": MessageRoleTypes.User.toLocaleLowerCase(),
        "content": McpToolPlannerExecutor.ToolSelectorPrompt(query, toolDefinitions)
      }); // Add the tool planning prompt as the last user message for tool selection and planning

      const toolsMessage = {
        "model": this.aiAppMcpServerConfig.plannerModel,
        "messages": modelMessages,
        "response_format": { "type": "json_object" },
        "temperature": this.aiAppMcpServerConfig.plannerTemperature || 0.3,
        "max_completion_tokens": this.aiAppMcpServerConfig.plannerMaxTokens || 1000
      };  // User message with tool definitions and selection prompt

      // LLM selects tools and plan
      const selectionCompletion = await helper.callAiAppEndpoint(request, this.epMetricsInfo, this.endpointsInfo, toolsMessage, this.appType);
      // console.log("******** Tool selection completion from planner model:", JSON.stringify(selectionCompletion, null, 2)); // Debug log to check the tool selection completion response

      if (!selectionCompletion || selectionCompletion === null) return; // No response from the planner model, skip tool execution

      const toolPlan = JSON.parse(selectionCompletion.choices[0].message.content);
      logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  Prompt/Query: %s\n  Tool Plan:\n  %s", splat: [scriptName, this.constructor.name, request.id, query, JSON.stringify(toolPlan, null, 2)] });

      if (toolPlan.tools.length > this.aiAppMcpServerConfig.maxToolsPerQuery)
        throw new Error(`Too many tools selected (${toolPlan.tools.length}); configured limit is ${this.aiAppMcpServerConfig.maxToolsPerQuery}`);

      if (!toolPlan.tools.length)
        return; // No tools selected, proceed with original query processing

      // Invoke tools based on plan
      let toolResults = {};
      if (toolPlan.plan === McpToolExecutionTypes.ParallelExecution) {
        const invocations = await Promise.all(toolPlan.tools.map(async (tool) => await this.#invokeMcpTool(tool)));
        invocations.forEach(inv => { toolResults[inv.toolId] = JSON.parse(inv.result) || null; });
      }
      else if (Array.isArray(toolPlan.plan)) {
        for (const sequence of toolPlan.plan) {
          for (const toolId of sequence) {
            const tool = toolPlan.tools.find(t => t.toolId === toolId);
            if (tool.dependsOn?.length) {
              tool.parameters = this.#resolveParameters(tool.parameters, toolResults);
            };

            const result = await this.#invokeMcpTool(tool);
            toolResults[toolId] = JSON.parse(result.result) || null; // Store the parsed result based on the tool output schema. If parsing fails, store null.
            console.log("******** Tool execution result for toolId:", { toolResults }); // Debug log to check the tool execution result after each tool invocation in sequential execution
          };
        };
      }
      else
        throw new Error('Invalid plan');

      console.log("******** Tool execution results:", JSON.stringify(toolResults, null, 2)); // Debug log to check the tool execution results
      request.body.messages = this.#updateMessagesWithToolOutputs(request.body, toolResults);
    }
    catch (error) {
      logger.log({ level: "warn", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  Error executing plan: %s", splat: [scriptName, this.constructor.name, request.id, error.message] });
    }
  };
} // End of McpToolPlannerExecutor class

module.exports = {
  McpToolPlannerExecutor
};