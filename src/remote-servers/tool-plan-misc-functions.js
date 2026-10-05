"use strict";

const {
  ToolExecutionEngine
} = require("./tool-execution-engine");

class RapidToolExecutionEngine extends ToolExecutionEngine {
  constructor(options = {}) {
    super(options);
  }

  async invokeRemoteTool(requestId, threadId, tool) {
    /*
     * Replace this code with the existing RAPID remote
     * MCP/Web API invocation logic.
     */
    return {
      toolId: tool.toolId,
      results: JSON.stringify({
        requestId,
        threadId,
        parameters: tool.parameters
      }),
      success: true,
      error: ""
    };
  }
}

const RapidToolPlannerExecutor =
  require("./rapid-tool-planner-executor");

const executor = new RapidToolPlannerExecutor({
  logger,
  maxTotalInvocations: 1000,
  maxFanOutPerNode: 500,
  maxFanOutDepth: 8,
  globalConcurrency: 50,
  defaultFanOutConcurrency: 20,
  memoize: true
});

const executionOutput = await executor.execute(
  requestId,
  threadId,
  toolPlan
);

if (!executionOutput.success) {
  throw new Error(
    executionOutput.error || "Tool plan execution failed."
  );
}

const synthesizerToolResults =
  executionOutput.results;

module.exports = RapidToolPlannerExecutor;