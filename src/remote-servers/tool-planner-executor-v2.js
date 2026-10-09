/**
 * Name: Tool planner class
 * Description: This class is responsible for generating a tool execution plan an important step in the inference processing pipeline.
 * It generates the tool plan which is the sequence and execution of remote tools.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-18-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');
const {
  CustomRequestHeaders,
  OpenAIChatCompletionMsgRoleTypes,
  AzAiServices,
  ToolPlannerTypes
} = require("../utilities/app-gtwy-constants.js");
const { sendStatus, sendError } = require("../lib/sse-event-broker.js");
const helper = require("../utilities/helper-funcs.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");
const { buildToolPlanningPrompt } = require("./tool-planner-helper-funcs.js");
const { ToolExecutionEngine } = require("./tool-execution-engine.js");
const { TOOL_PLAN_SCHEMA } = require("./tool-execution-engine.js");

class ToolPlannerExecutorV1 {

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

  /**
 * This function extracts the last user message from the request context, which can be used as input for MCP tool planning.
 * 
 * @param {Array} messages The messages array from the request context.
 * @return {String} The content of the last user message, or an empty string if no user message is found.
 */
  #getLastUserMessage(messages) { // Private method to extract the last user message from the messages array
    let lastUserMessage = null;

    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === OpenAIChatCompletionMsgRoleTypes.UserMessage) {
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
    if (userMessage.role === OpenAIChatCompletionMsgRoleTypes.UserMessage)
      userMessage.content = ToolPlannerExecutorV1.SynthesizePrompt(lastUserMessage.content, toolResults);

    return updatedMessages;
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
      const {
        systemPrompt,
        userPrompt
      } = buildToolPlanningPrompt({userQuery: query, tools: toolDefinitions});
      // const sysUserprompt = buildToolPlanningPrompt({userQuery: query, tools: toolDefinitions});
      modelMessages.push({ // Add the tool planning system prompt
        "role": OpenAIChatCompletionMsgRoleTypes.SystemMessage,
        "content": systemPrompt
      });
      modelMessages.push({ // Add the tool planning user prompt as the last user message for tool selection and planning
        "role": OpenAIChatCompletionMsgRoleTypes.UserMessage,
        "content": userPrompt
      });

      const toolsMessage = {
        "model": this.aiAppRemoteServerConfig.plannerModel,
        ...((this.appType === AzAiServices.Anthropic) && systemMsg && { system: systemMsg.content }),
        "messages": modelMessages,
        ...((this.appType === AzAiServices.OAI) && { response_format: { type: "json_object" } }),
        // ...((this.appType === AzAiServices.OAI) && { response_format: { type: "json_schema", json_schema: { name: "tool_execution_plan", strict: true, schema: TOOL_PLAN_SCHEMA } }}),
        "temperature": this.aiAppRemoteServerConfig.plannerTemperature || 1,
        ...((this.appType === AzAiServices.OAI) && { max_completion_tokens: this.aiAppRemoteServerConfig.plannerMaxTokens || 5000 }),
        ...((this.appType === AzAiServices.Anthropic) && { max_tokens: this.aiAppRemoteServerConfig.plannerMaxTokens || 5000 }),
        ...((this.appType === AzAiServices.OAI) && { reasoning_effort: this.aiAppRemoteServerConfig.reasoningEffort || "medium" } ), // none, minimal, low, medium, high, xhigh, max
        ...((this.appType === AzAiServices.Anthropic) && { thinking: { type: "adaptive" } }),
        ...((this.appType === AzAiServices.Anthropic) && { outputConfig: { effort: this.aiAppRemoteServerConfig.reasoningEffort || "medium", format: { type: "json_schema", schema: TOOL_PLAN_SCHEMA } } }),
      };  // User message with tool definitions and selection prompt

      let stTime = Date.now();
      // LLM selects tools and plan
      const selectionCompletion = await helper.callAiAppEndpoint(request, this.epMetricsInfo, this.endpointsInfo, toolsMessage, this.appType, normsConfig); // Non streaming call
      const execTime = (Date.now() - stTime) / 1000;
      // console.log("******** Tool selection completion from planner model:", JSON.stringify(selectionCompletion, null, 2)); // Debug log to check the tool selection completion response

      if (!selectionCompletion || selectionCompletion === null) return; // No response from the planner model, skip tool execution

      const toolPlan = (this.appType === AzAiServices.OAI) ? JSON.parse(selectionCompletion.choices[0].message.content) : JSON.parse(selectionCompletion.content[0].text);
      logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  Prompt/Query: %s\n  Tool Plan:\n  %s", splat: [scriptName, this.constructor.name, request.id, query, JSON.stringify(toolPlan, null, 2)] });

      if (toolPlan.nodes.length > this.aiAppRemoteServerConfig.maxToolsPerQuery)
        throw new Error(`Too many tools selected (${toolPlan.nodes.length}); configured limit is ${this.aiAppRemoteServerConfig.maxToolsPerQuery}`);

      if (!toolPlan.nodes.length) {
        if (sessionId)
          sendStatus(sessionId, "⏭️ No tools identified, skipping tool execution...");

        return (execToolCount); // No tools selected, proceed with original query processing
      }
      else
        execToolCount = toolPlan.nodes.length; // Set the tools count

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
          ToolPlannerTypes.Version1,
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
      
      const executor = new ToolExecutionEngine(
        this.serverName,
        this.appId,
        this.remoteServerConfig,
        this.mcpBridges,
        {
          maxTotalInvocations: 1000,
          maxFanOutPerNode: 500,
          maxFanOutDepth: 8,
          globalConcurrency: 50,
          defaultFanOutConcurrency: 20,
          memoize: true
        }
      );
      
      const executionOutput = await executor.execute(
        request,
        threadId,
        toolPlan
      );
      
      /*
      if (!executionOutput.success) {
        throw new Error(
          executionOutput.error || "Tool plan execution failed."
        );
      };
      */
      
      const synthesizerToolResults =
        executionOutput.results; // success / partial failure
      const { results, ...logToolsOutput } = executionOutput; // Do not print tool output

      logger.log({ level: "debug", message: "[%s] %s.planAndExecuteTools(): Finished tool execution.\n  Request ID: %s\n  Execution Stats: %s", splat: [scriptName, this.constructor.name, request.id, JSON.stringify(logToolsOutput, null, 2)] });
      request.body.messages = this.#updateMessagesWithToolOutputs(request.body, synthesizerToolResults);
    }
    catch (error) {
      execToolCount = 0;

      if (sessionId)
        sendError(sessionId, `Error executing tool plan. Error: ${error.message}`);

      logger.log({ level: "warn", message: "[%s] %s.planAndExecuteTools():\n  Request ID: %s\n  Error executing plan: %s", splat: [scriptName, this.constructor.name, request.id, error.message] });
    };

    return (execToolCount);
  }
} // End of ToolPlannerExecutorV1 class

module.exports = {
  ToolPlannerExecutorV1
};