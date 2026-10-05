"use strict";

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');

const {
  CustomRequestHeaders,
  McpMethods,
  McpServerAuthTypes,
  RemoteServerProtocol,
  DocProcessorStatus,
} = require("../utilities/app-gtwy-constants.js");
const { getMcpServerResponse } = require("./clients/mcp-client.js");
const { sendTrace, sendError } = require("../lib/sse-event-broker.js");
const { TblNames, PersistDao } = require("../utilities/persist-dao.js");
const persistdb = require("../services/pp-pg.js");

const Ajv = require("ajv");

const TOOL_PLAN_SCHEMA = {
  $id: "https://rapid.microsoft.com/schemas/tool-execution-plan.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["planVersion", "reason", "nodes"],
  properties: {
    planVersion: {
      type: "string",
      const: "1.0"
    },
    reason: {
      type: "string"
    },
    nodes: {
      type: "array",
      items: {
        $ref: "#/$defs/node"
      }
    }
  },
  $defs: {
    referenceExpression: {
      type: "object",
      additionalProperties: false,
      required: ["$from" , "path"],
      properties: {
        $from: {
          type: "string",
          minLength: 1
        },
        path: {
          type: "string"
        },
        collect: {
          type: "string",
          enum: ["list", "flatten"]
        }
      }
    },
    variableExpression: {
      type: "object",
      additionalProperties: false,
      required: ["$var"],
      properties: {
        $var: {
          type: "string",
          minLength: 1
        }
      }
    },
    forEach: {
      type: "object",
      additionalProperties: false,
      required: ["source", "as"],
      properties: {
        source: {
          $ref: "#/$defs/referenceExpression"
        },
        as: {
          type: "string",
          pattern: "^[A-Za-z_][A-Za-z0-9_]*$"
        },
        maxConcurrency: {
          type: "integer",
          minimum: 1,
          maximum: 100
        }
      }
    },
    node: {
      type: "object",
      additionalProperties: false,
      required: ["id", "tool", "parameters", "dependsOn"],
      properties: {
        id: {
          type: "string",
          pattern: "^[A-Za-z0-9_-]+$"
        },
        tool: {
          type: "string",
          pattern: "^[^|\\s]+\\|[^|\\s]+$"
        },
        parameters: {
          type: "object"
        },
        dependsOn: {
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1
          }
        },
        forEach: {
          $ref: "#/$defs/forEach"
        },
        onError: {
          type: "string",
          enum: ["fail", "skip"]
        }
      }
    }
  }
};

class Semaphore {
  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("Semaphore limit must be a positive integer.");
    }

    this.limit = limit;
    this.active = 0;
    this.waiters = [];
  }

  async acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }

    await new Promise((resolve) => {
      this.waiters.push(resolve);
    });

    this.active += 1;
  }

  release() {
    if (this.active === 0) {
      return;
    }

    this.active -= 1;

    const next = this.waiters.shift();

    if (next) {
      next();
    }
  }

  async run(task) {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

class ToolExecutionEngine {
  /**
   * Constructor for the Tool Execution Engine class.
   * Initializes necessary properties and dependencies for executing remote tools.
   *
   * @param {String} serverName Unique ID of this server
   * @param {String} appId AI Application ID
   * @param {Object} remoteServerConfig Remote Servers Configuration Object
   * @param {String} mcpBridges [{ serverId: "xyz", "bridge": mcpBridgeObject}, ...]
   * @param {Object} options
   */
  constructor(serverName, appId, remoteServerConfig, mcpBridges, options = {}) {
    this.serverName = serverName;
    this.instanceName = process.env.POD_NAME || process.env.CONTAINER_APP_REPLICA_NAME || null; // Unique instance name of the pod or container app replica (or null)
    this.appId = appId;
    this.remoteServerConfig = remoteServerConfig;
    this.mcpBridges = mcpBridges;
    this.toolSeqId = 1; // Initialize tool execution sequence id

    this.options = {
      maxTotalInvocations: options.maxTotalInvocations ?? 1000,
      maxFanOutPerNode: options.maxFanOutPerNode ?? 500,
      maxFanOutDepth: options.maxFanOutDepth ?? 8,
      globalConcurrency: options.globalConcurrency ?? 50,
      defaultFanOutConcurrency: options.defaultFanOutConcurrency ?? 20,
      memoize: options.memoize ?? true
    };

    this.validateOptions();

    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      allowUnionTypes: true
    });

    this.validateToolPlan = this.ajv.compile(TOOL_PLAN_SCHEMA);
    this.globalSemaphore = new Semaphore(
      this.options.globalConcurrency
    );

    this.resetExecutionState();
  }

  validateOptions() {
    const positiveIntegerOptions = [
      "maxTotalInvocations",
      "maxFanOutPerNode",
      "maxFanOutDepth",
      "globalConcurrency",
      "defaultFanOutConcurrency"
    ];

    for (const optionName of positiveIntegerOptions) {
      const value = this.options[optionName];

      if (!Number.isInteger(value) || value < 1) {
        throw new Error(
          `${optionName} must be a positive integer.`
        );
      }
    }
  }

  resetExecutionState() {
    this.nodeMap = new Map();
    this.nodeResults = new Map();
    this.cache = new Map();

    this.executionRecords = [];
    this.errors = [];
    this.synthesizerResults = {};

    this.invocationCount = 0;
    this.toolNumber = 0;
    this.failed = false;
    this.failureError = null;
  }

  /**
   * Executes a planner-generated tool plan.
   *
   * @param {object} request
   * @param {string} threadId
   * @param {object|string} toolPlan
   * @returns {Promise<object>}
   */
  async execute(request, threadId, toolPlan) {
    this.resetExecutionState();

    try {
      const normalizedPlan = this.parsePlan(toolPlan);

      this.validatePlan(normalizedPlan);
      this.validatePlanSemantics(normalizedPlan);

      this.log({
        level: "debug",
        methodName: "execute",
        message: "Starting tool execution plan.",
        requestId: request.id,
        threadId,
        status: "started",
        additionalInfo: {
          planVersion: normalizedPlan.planVersion,
          nodeCount: normalizedPlan.nodes.length,
          reason: normalizedPlan.reason
        }
      });

      this.nodeMap = new Map(
        normalizedPlan.nodes.map((node) => [node.id, node])
      );

      const executionLevels = this.buildExecutionLevels(
        normalizedPlan.nodes
      );

      for (const level of executionLevels) {
        if (this.failed) {
          break;
        }

        await Promise.all(
          level.map((node) =>
            this.executeNode(request, threadId, node)
          )
        );
      };

      this.log({
        level: this.failed ? "error" : "info",
        methodName: "execute",
        message: this.failed
          ? "Tool execution plan completed with errors."
          : "Tool execution plan completed successfully.",
        requestId: request.id,
        threadId,
        status: this.failed ? "failed" : "success",
        additionalInfo: {
          plannedNodeCount: normalizedPlan.nodes.length,
          remoteInvocationCount: this.invocationCount,
          executionRecordCount: this.executionRecords.length,
          errorCount: this.errors.length
        },
        error: this.failureError
      });

      return this.buildFinalOutput(
        normalizedPlan,
        !this.failed
      );
    }
    catch (error) {
      const normalizedError = this.normalizeError(error);

      this.failed = true;
      this.failureError = normalizedError;

      this.errors.push({
        nodeId: null,
        toolId: null,
        error: normalizedError
      });

      this.log({
        level: "error",
        methodName: "execute",
        message: "Tool execution plan failed.",
        requestId: request.id,
        threadId,
        status: "failed",
        error: normalizedError
      });

      return this.buildFinalOutput(toolPlan, false);
    };
  }

  parsePlan(toolPlan) {
    if (
      toolPlan &&
      typeof toolPlan === "object" &&
      !Array.isArray(toolPlan)
    ) {
      return toolPlan;
    }

    if (typeof toolPlan !== "string") {
      throw new Error(
        "Tool plan must be a JSON object or JSON string."
      );
    }

    try {
      return JSON.parse(toolPlan);
    } catch (error) {
      throw new Error(
        `Unable to parse tool plan JSON: ${error.message}`
      );
    }
  }

  validatePlan(toolPlan) {
    const valid = this.validateToolPlan(toolPlan);

    if (valid) {
      return;
    }

    const validationMessage = this.ajv.errorsText(
      this.validateToolPlan.errors,
      {
        separator: "; ",
        dataVar: "toolPlan"
      }
    );

    throw new Error(
      `Invalid tool execution plan: ${validationMessage}`
    );
  }

  validatePlanSemantics(toolPlan) {
    const nodes = toolPlan.nodes;
    const nodeMap = new Map();

    for (const node of nodes) {
      if (nodeMap.has(node.id)) {
        throw new Error(
          `Duplicate planner node ID '${node.id}'.`
        );
      }

      nodeMap.set(node.id, node);
    }

    for (const node of nodes) {
      for (const dependencyId of node.dependsOn) {
        if (!nodeMap.has(dependencyId)) {
          throw new Error(
            `Node '${node.id}' references unknown dependency ` +
            `'${dependencyId}'.`
          );
        }

        if (dependencyId === node.id) {
          throw new Error(
            `Node '${node.id}' cannot depend on itself.`
          );
        }
      }

      if (node.forEach) {
        const sourceNodeId = node.forEach.source.$from;

        if (!node.dependsOn.includes(sourceNodeId)) {
          throw new Error(
            `Node '${node.id}' must include its forEach source ` +
            `'${sourceNodeId}' in dependsOn.`
          );
        }
      }
    }

    this.detectCycles(nodes, nodeMap);

    const ancestorMap = this.buildAncestorMap(nodes, nodeMap);
    const loopVariables = this.buildLoopVariableMap(
      nodes,
      nodeMap,
      ancestorMap
    );

    for (const node of nodes) {
      this.validateExpressions(
        node.parameters,
        node,
        nodeMap,
        ancestorMap,
        loopVariables
      );

      if (node.forEach) {
        this.validateReferenceExpression(
          node.forEach.source,
          node,
          nodeMap,
          ancestorMap
        );
      }

      this.validateFanInRules(
        node,
        nodeMap
      );

      const depth = this.calculateFanOutDepth(
        node.id,
        nodeMap,
        new Map()
      );

      if (depth > this.options.maxFanOutDepth) {
        throw new Error(
          `Node '${node.id}' exceeds maximum fan-out depth ` +
          `${this.options.maxFanOutDepth}.`
        );
      }
    }
  }

  detectCycles(nodes, nodeMap) {
    const states = new Map();

    const visit = (nodeId, path) => {
      const state = states.get(nodeId);

      if (state === "visited") {
        return;
      }

      if (state === "visiting") {
        throw new Error(
          `Dependency cycle detected: ${[
            ...path,
            nodeId
          ].join(" -> ")}`
        );
      }

      states.set(nodeId, "visiting");

      const node = nodeMap.get(nodeId);

      for (const dependencyId of node.dependsOn) {
        visit(dependencyId, [...path, nodeId]);
      }

      states.set(nodeId, "visited");
    };

    for (const node of nodes) {
      visit(node.id, []);
    }
  }

  buildAncestorMap(nodes, nodeMap) {
    const ancestorMap = new Map();

    const getAncestors = (nodeId) => {
      if (ancestorMap.has(nodeId)) {
        return ancestorMap.get(nodeId);
      }

      const ancestors = new Set();
      const node = nodeMap.get(nodeId);

      for (const dependencyId of node.dependsOn) {
        ancestors.add(dependencyId);

        for (const ancestorId of getAncestors(dependencyId)) {
          ancestors.add(ancestorId);
        }
      }

      ancestorMap.set(nodeId, ancestors);
      return ancestors;
    };

    for (const node of nodes) {
      getAncestors(node.id);
    }

    return ancestorMap;
  }

  buildLoopVariableMap(nodes, nodeMap, ancestorMap) {
    const variableMap = new Map();

    for (const node of nodes) {
      const variables = new Set();

      for (const ancestorId of ancestorMap.get(node.id)) {
        const ancestorNode = nodeMap.get(ancestorId);

        if (ancestorNode.forEach) {
          variables.add(ancestorNode.forEach.as);
        }
      }

      if (node.forEach) {
        variables.add(node.forEach.as);
      }

      variableMap.set(node.id, variables);
    }

    return variableMap;
  }

  validateExpressions(
    value,
    node,
    nodeMap,
    ancestorMap,
    loopVariables
  ) {
    this.walkValues(value, (candidate) => {
      if (this.isReferenceExpression(candidate)) {
        this.validateReferenceExpression(
          candidate,
          node,
          nodeMap,
          ancestorMap
        );
      }

      if (this.isVariableExpression(candidate)) {
        const variableName = this.getRootPathSegment(
          candidate.$var
        );

        if (!loopVariables.get(node.id).has(variableName)) {
          throw new Error(
            `Node '${node.id}' references unavailable loop ` +
            `variable '${variableName}'.`
          );
        }
      }
    });
  }

  validateReferenceExpression(
    expression,
    node,
    nodeMap,
    ancestorMap
  ) {
    const sourceNodeId = expression.$from;

    if (!nodeMap.has(sourceNodeId)) {
      throw new Error(
        `Node '${node.id}' references unknown node ` +
        `'${sourceNodeId}'.`
      );
    }

    if (
      !node.dependsOn.includes(sourceNodeId) &&
      !ancestorMap.get(node.id).has(sourceNodeId)
    ) {
      throw new Error(
        `Node '${node.id}' references '${sourceNodeId}', but ` +
        `the source is not a dependency or dependency ancestor.`
      );
    }
  }

  validateFanInRules(node, nodeMap) {
    if (node.forEach) {
      return;
    }

    for (const dependencyId of node.dependsOn) {
      const dependency = nodeMap.get(dependencyId);

      if (!dependency.forEach) {
        continue;
      }

      const references = this.findReferencesToNode(
        node.parameters,
        dependencyId
      );

      if (references.length === 0) {
        throw new Error(
          `Node '${node.id}' depends on fanned-out node ` +
          `'${dependencyId}' but does not explicitly consume ` +
          "its results."
        );
      }

      for (const reference of references) {
        if (!reference.collect) {
          throw new Error(
            `Node '${node.id}' must specify collect when ` +
            `referencing fanned-out node '${dependencyId}'.`
          );
        }
      }
    }
  }

  findReferencesToNode(value, sourceNodeId) {
    const references = [];

    this.walkValues(value, (candidate) => {
      if (
        this.isReferenceExpression(candidate) &&
        candidate.$from === sourceNodeId
      ) {
        references.push(candidate);
      }
    });

    return references;
  }

  walkValues(value, visitor) {
    if (!value || typeof value !== "object") {
      return;
    }

    visitor(value);

    if (
      this.isReferenceExpression(value) ||
      this.isVariableExpression(value)
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.walkValues(item, visitor);
      }

      return;
    }

    for (const child of Object.values(value)) {
      this.walkValues(child, visitor);
    }
  }

  calculateFanOutDepth(nodeId, nodeMap, memo) {
    if (memo.has(nodeId)) {
      return memo.get(nodeId);
    }

    const node = nodeMap.get(nodeId);
    let parentDepth = 0;

    for (const dependencyId of node.dependsOn) {
      parentDepth = Math.max(
        parentDepth,
        this.calculateFanOutDepth(
          dependencyId,
          nodeMap,
          memo
        )
      );
    }

    const depth = parentDepth + (node.forEach ? 1 : 0);

    memo.set(nodeId, depth);
    return depth;
  }

  buildExecutionLevels(nodes) {
    const nodeMap = new Map(
      nodes.map((node) => [node.id, node])
    );

    const inDegree = new Map();
    const dependents = new Map();

    for (const node of nodes) {
      inDegree.set(node.id, node.dependsOn.length);
      dependents.set(node.id, []);
    }

    for (const node of nodes) {
      for (const dependencyId of node.dependsOn) {
        dependents.get(dependencyId).push(node.id);
      }
    }

    let ready = nodes
      .filter((node) => inDegree.get(node.id) === 0)
      .map((node) => node.id);

    const levels = [];
    let processed = 0;

    while (ready.length > 0) {
      const currentLevelIds = ready;
      ready = [];

      levels.push(
        currentLevelIds.map((nodeId) => nodeMap.get(nodeId))
      );

      processed += currentLevelIds.length;

      for (const nodeId of currentLevelIds) {
        for (const dependentId of dependents.get(nodeId)) {
          const nextDegree =
            inDegree.get(dependentId) - 1;

          inDegree.set(dependentId, nextDegree);

          if (nextDegree === 0) {
            ready.push(dependentId);
          }
        }
      }
    }

    if (processed !== nodes.length) {
      throw new Error(
        "Unable to build execution graph because it contains a cycle."
      );
    }

    return levels;
  }

  async executeNode(request, threadId, node) {
    if (this.failed) {
      return;
    }

    const blockedDependency = this.findBlockedDependency(node);

    if (blockedDependency) {
      const error =
        `Node '${node.id}' was not executed because dependency ` +
        `'${blockedDependency}' failed.`;

      this.addSkippedNodeRecord(
        node,
        error,
        request.id,
        threadId
      );
      return;
    }

    try {
      const contexts = node.forEach
        ? this.expandForEach(node)
        : [this.createRootContext()];

      if (contexts.length === 0) {
        this.nodeResults.set(node.id, []);
        return;
      }

      if (
        contexts.length > this.options.maxFanOutPerNode
      ) {
        throw new Error(
          `Node '${node.id}' expanded to ${contexts.length} ` +
          `invocations, exceeding maxFanOutPerNode ` +
          `${this.options.maxFanOutPerNode}.`
        );
      }

      const concurrency = node.forEach
        ? Math.min(
          node.forEach.maxConcurrency ??
          this.options.defaultFanOutConcurrency,
          this.options.globalConcurrency
        )
        : 1;

      const nodeSemaphore = new Semaphore(concurrency);

      const executions = contexts.map((context) =>
        nodeSemaphore.run(() =>
          this.executeNodeInvocation(
            request,
            threadId,
            node,
            context
          )
        )
      );

      await Promise.all(executions);
    } catch (error) {
      const normalizedError = this.normalizeError(error);
      const onError = this.getOnErrorPolicy(node);

      this.errors.push({
        nodeId: node.id,
        toolId: node.tool,
        error: normalizedError
      });

      if (onError === "fail") {
        this.failed = true;
        this.failureError = normalizedError;
      }

      this.log({
        level: onError === "fail" ? "error" : "warn",
        methodName: "executeNode",
        message: "Tool plan node execution failed.",
        requestId: request.id,
        threadId,
        nodeId: node.id,
        toolId: node.tool,
        error: normalizedError
      });
    }
  }

  findBlockedDependency(node) {
    for (const dependencyId of node.dependsOn) {
      const records = this.nodeResults.get(dependencyId);

      if (!records || records.length === 0) {
        return dependencyId;
      }

      const hasSuccessfulRecord = records.some(
        (record) => record.success
      );

      if (!hasSuccessfulRecord) {
        return dependencyId;
      }
    }

    return null;
  }

  createRootContext() {
    return {
      scope: {},
      scopeIds: {},
      iterationPath: []
    };
  }

  expandForEach(node) {
    const expression = node.forEach.source;
    const sourceRecords = this.getSuccessfulNodeRecords(
      expression.$from
    );

    const contexts = [];

    for (const sourceRecord of sourceRecords) {
      const items = this.getValueAtPath(
        sourceRecord.output,
        expression.path
      );

      if (!Array.isArray(items)) {
        throw new Error(
          `forEach source for node '${node.id}' must resolve ` +
          `to an array. Source '${expression.$from}' path ` +
          `'${expression.path || ""}' resolved to ` +
          `${this.describeType(items)}.`
        );
      }

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];

        const scope = {
          ...sourceRecord.scope,
          [node.forEach.as]: item
        };

        const scopeIds = {
          ...sourceRecord.scopeIds,
          [node.forEach.as]:
            `${expression.$from}:${sourceRecord.recordId}:${index}`
        };

        contexts.push({
          scope,
          scopeIds,
          iterationPath: [
            ...sourceRecord.iterationPath,
            index
          ]
        });
      }
    }

    return contexts;
  }

  async executeNodeInvocation(
    request,
    threadId,
    node,
    context
  ) {
    if (this.failed) {
      return;
    }

    let parameters;

    try {
      parameters = this.resolveParameters(
        node.parameters,
        context
      );
    } catch (error) {
      await this.handleInvocationFailure({
        requestId: request.id,
        threadId,
        node,
        context,
        parameters: null,
        toolNo: null,
        durationMs: 0,
        error
      });

      return;
    }

    if (
      this.invocationCount >=
      this.options.maxTotalInvocations
    ) {
      await this.handleInvocationFailure({
        requestId: request.id,
        threadId,
        node,
        context,
        parameters,
        toolNo: null,
        durationMs: 0,
        error: new Error(
          `Tool plan exceeded maxTotalInvocations ` +
          `${this.options.maxTotalInvocations}.`
        )
      });

      return;
    }

    const cacheKey = this.createCacheKey(
      node.tool,
      parameters
    );

    if (
      this.options.memoize &&
      this.cache.has(cacheKey)
    ) {
      const cachedEntry = this.cache.get(cacheKey);

      this.addNodeResult(node.id, {
        recordId: this.createRecordId(node.id),
        nodeId: node.id,
        toolId: node.tool,
        toolNo: cachedEntry.toolNo,
        success: true,
        cached: true,
        parameters,
        output: cachedEntry.output,
        error: null,
        durationMs: 0,
        scope: context.scope,
        scopeIds: context.scopeIds,
        iterationPath: context.iterationPath
      });

      this.log({
        level: "debug",
        methodName: "executeNodeInvocation",
        message: "Using cached remote tool result.",
        requestId: request.id,
        threadId,
        nodeId: node.id,
        toolId: node.tool,
        toolNo: cachedEntry.toolNo,
        status: "cache-hit",
        parameters
      });

      return;
    };

    const toolNo = this.toolNumber;
    this.toolNumber += 1;
    this.invocationCount += 1;

    const [serverId, toolName] = this.splitToolId(
      node.tool
    );

    this.log({
      level: "debug",
      methodName: "executeNodeInvocation",
      message: "Invoking remote tool.",
      requestId: request.id,
      threadId,
      nodeId: node.id,
      serverId,
      toolId: node.tool,
      toolName,
      toolNo,
      status: "started",
      parameters
    });

    const startedAt = Date.now();

    try {
      const response = await this.globalSemaphore.run(
        () =>
          this.invokeRemoteTool(
            request,
            threadId,
            {
              nodeId: node.id,
              toolId: node.tool,
              parameters
            }
          )
      );

      const durationMs = Date.now() - startedAt;
      const output = this.parseToolResult(
        node,
        response
      );

      const resultRecord = {
        recordId: this.createRecordId(node.id),
        nodeId: node.id,
        toolId: node.tool,
        toolNo,
        success: true,
        cached: false,
        parameters,
        output,
        error: null,
        durationMs,
        scope: context.scope,
        scopeIds: context.scopeIds,
        iterationPath: context.iterationPath
      };

      this.addNodeResult(node.id, resultRecord);
      this.addSynthesizerResult(
        node.tool,
        toolNo,
        output
      );

      if (this.options.memoize) {
        this.cache.set(cacheKey, {
          toolNo,
          output
        });
      }

      this.log({
        level: "info",
        methodName: "executeNodeInvocation",
        message: "Remote tool invocation completed.",
        requestId: request.id,
        threadId,
        nodeId: node.id,
        serverId,
        toolId: node.tool,
        toolName,
        toolNo,
        status: "success",
        durationMs,
        parameters
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      await this.handleInvocationFailure({
        requestId: request.id,
        threadId,
        node,
        context,
        parameters,
        toolNo,
        durationMs,
        error
      });
    }
  }

  async handleInvocationFailure({
    requestId,
    threadId,
    node,
    context,
    parameters,
    toolNo,
    durationMs,
    error
  }) {
    const normalizedError = this.normalizeError(error);
    const onError = this.getOnErrorPolicy(node);
    const [serverId, toolName] = this.splitToolId(
      node.tool
    );

    const record = {
      recordId: this.createRecordId(node.id),
      nodeId: node.id,
      toolId: node.tool,
      toolNo,
      success: false,
      cached: false,
      parameters,
      output: null,
      error: normalizedError,
      durationMs,
      scope: context.scope,
      scopeIds: context.scopeIds,
      iterationPath: context.iterationPath
    };

    this.addNodeResult(node.id, record);

    this.errors.push({
      nodeId: node.id,
      toolId: node.tool,
      toolNo,
      iterationPath: context.iterationPath,
      error: normalizedError
    });

    this.log({
      level: onError === "fail" ? "error" : "warn",
      methodName: "handleInvocationFailure",
      message:
        onError === "fail"
          ? "Remote tool invocation failed."
          : "Remote tool invocation failed and will be skipped.",
      requestId,
      threadId,
      nodeId: node.id,
      serverId,
      toolId: node.tool,
      toolName,
      toolNo,
      status: "failed",
      durationMs,
      parameters,
      error: normalizedError
    });

    if (onError === "fail") {
      this.failed = true;
      this.failureError = normalizedError;
    }
  }

  getOnErrorPolicy(node) {
    if (node.onError) {
      return node.onError;
    }

    return node.forEach ? "skip" : "fail";
  }

  resolveParameters(parameters, context) {
    return this.resolveValue(parameters, context);
  }

  resolveValue(value, context) {
    if (
      value === null ||
      value === undefined ||
      typeof value !== "object"
    ) {
      return value;
    }

    if (this.isReferenceExpression(value)) {
      return this.resolveFrom(value, context);
    }

    if (this.isVariableExpression(value)) {
      return this.resolveVariable(value, context);
    }

    if (Array.isArray(value)) {
      return value.map((item) =>
        this.resolveValue(item, context)
      );
    }

    const resolvedObject = {};

    for (const [key, childValue] of Object.entries(value)) {
      resolvedObject[key] = this.resolveValue(
        childValue,
        context
      );
    }

    return resolvedObject;
  }

  resolveFrom(expression, context) {
    const records = this.getCompatibleNodeRecords(
      expression.$from,
      context
    );

    if (records.length === 0) {
      throw new Error(
        `No successful result is available for node ` +
        `'${expression.$from}' in the current execution scope.`
      );
    }

    if (expression.collect) {
      const values = records.map((record) =>
        this.getValueAtPath(
          record.output,
          expression.path
        )
      );

      if (expression.collect === "flatten") {
        return values.flat();
      }

      return values;
    }

    if (records.length > 1) {
      throw new Error(
        `Reference to node '${expression.$from}' resolved to ` +
        `${records.length} results. Specify collect as ` +
        "'list' or 'flatten'."
      );
    }

    return this.getValueAtPath(
      records[0].output,
      expression.path
    );
  }

  resolveVariable(expression, context) {
    const segments = this.parsePath(expression.$var);
    const variableName = segments.shift();

    if (
      !Object.prototype.hasOwnProperty.call(
        context.scope,
        variableName
      )
    ) {
      throw new Error(
        `Loop variable '${variableName}' is not available ` +
        "in the current execution scope."
      );
    }

    let value = context.scope[variableName];

    for (const segment of segments) {
      if (
        value === null ||
        value === undefined ||
        !Object.prototype.hasOwnProperty.call(value, segment)
      ) {
        throw new Error(
          `Unable to resolve loop variable path ` +
          `'${expression.$var}'.`
        );
      }

      value = value[segment];
    }

    return value;
  }

  getCompatibleNodeRecords(nodeId, context) {
    const records = this.getSuccessfulNodeRecords(nodeId);

    const compatibleRecords = records.filter((record) =>
      this.areScopesCompatible(
        record.scopeIds,
        context.scopeIds
      )
    );

    compatibleRecords.sort(
      (left, right) =>
        Object.keys(right.scopeIds).length -
        Object.keys(left.scopeIds).length
    );

    if (compatibleRecords.length <= 1) {
      return compatibleRecords;
    }

    const mostSpecificDepth = Object.keys(
      compatibleRecords[0].scopeIds
    ).length;

    return compatibleRecords.filter(
      (record) =>
        Object.keys(record.scopeIds).length ===
        mostSpecificDepth
    );
  }

  areScopesCompatible(leftScopeIds, rightScopeIds) {
    const sharedKeys = Object.keys(leftScopeIds).filter(
      (key) =>
        Object.prototype.hasOwnProperty.call(
          rightScopeIds,
          key
        )
    );

    return sharedKeys.every(
      (key) => leftScopeIds[key] === rightScopeIds[key]
    );
  }

  getValueAtPath(value, path) {
    if (!path) {
      return value;
    }

    const segments = this.parsePath(path);
    let current = value;

    for (const segment of segments) {
      if (
        current === null ||
        current === undefined ||
        !Object.prototype.hasOwnProperty.call(
          Object(current),
          segment
        )
      ) {
        throw new Error(
          `Unable to resolve result path '${path}'.`
        );
      }

      current = current[segment];
    }

    return current;
  }

  parsePath(path) {
    if (!path) {
      return [];
    }

    if (typeof path !== "string") {
      throw new Error("A result path must be a string.");
    }

    const normalizedPath = path.replace(
      /\[(\d+)\]/g,
      ".$1"
    );

    const segments = normalizedPath
      .split(".")
      .filter(Boolean);

    const unsafeSegments = new Set([
      "__proto__",
      "prototype",
      "constructor"
    ]);

    for (const segment of segments) {
      if (unsafeSegments.has(segment)) {
        throw new Error(
          `Unsafe result path segment '${segment}'.`
        );
      }
    }

    return segments.map((segment) =>
      /^\d+$/.test(segment)
        ? Number.parseInt(segment, 10)
        : segment
    );
  }

  parseToolResult(node, response) {
    if (!response || typeof response !== "object") {
      throw new Error(
        `Remote tool '${node.tool}' returned an invalid response.`
      );
    }

    if (response.toolId !== node.tool) {
      throw new Error(
        `Remote tool response ID '${response.toolId}' does not ` +
        `match requested tool '${node.tool}'.`
      );
    }

    if (response.success !== true) {
      throw new Error(
        response.error ||
        `Remote tool '${node.tool}' reported failure.`
      );
    }

    if (typeof response.results !== "string") {
      throw new Error(
        `Remote tool '${node.tool}' must return results as a ` +
        "stringified JSON value."
      );
    }

    try {
      return JSON.parse(response.results);
    } catch (error) {
      throw new Error(
        `Remote tool '${node.tool}' returned invalid JSON: ` +
        error.message
      );
    }
  }

  addNodeResult(nodeId, record) {
    if (!this.nodeResults.has(nodeId)) {
      this.nodeResults.set(nodeId, []);
    }

    this.nodeResults.get(nodeId).push(record);
    this.executionRecords.push(record);
  }

  getSuccessfulNodeRecords(nodeId) {
    return (this.nodeResults.get(nodeId) || []).filter(
      (record) => record.success
    );
  }

  addSynthesizerResult(toolId, toolNo, output) {
    const resultKey = `${toolId}${toolNo}`;
    this.synthesizerResults[resultKey] = output;
  }

  addSkippedNodeRecord(
    node,
    error,
    requestId,
    threadId
  ) {
    const record = {
      recordId: this.createRecordId(node.id),
      nodeId: node.id,
      toolId: node.tool,
      toolNo: null,
      success: false,
      cached: false,
      skipped: true,
      parameters: null,
      output: null,
      error,
      durationMs: 0,
      scope: {},
      scopeIds: {},
      iterationPath: []
    };

    this.addNodeResult(node.id, record);

    this.errors.push({
      nodeId: node.id,
      toolId: node.tool,
      error
    });

    this.log({
      level: "warn",
      methodName: "addSkippedNodeRecord",
      message:
        "Tool plan node skipped because a required dependency did not produce a successful result.",
      requestId,
      threadId,
      nodeId: node.id,
      toolId: node.tool,
      status: "skipped",
      error
    });
  }

  createRecordId(nodeId) {
    return `${nodeId}:${this.executionRecords.length}`;
  }

  createCacheKey(toolId, parameters) {
    return `${toolId}:${this.stableStringify(parameters)}`;
  }

  stableStringify(value) {
    const seen = new WeakSet();

    const normalize = (candidate) => {
      if (
        candidate === null ||
        typeof candidate !== "object"
      ) {
        return candidate;
      }

      if (seen.has(candidate)) {
        throw new Error(
          "Unable to create cache key for circular parameters."
        );
      }

      seen.add(candidate);

      try {
        if (Array.isArray(candidate)) {
          return candidate.map(normalize);
        }

        const output = {};

        for (const key of Object.keys(candidate).sort()) {
          output[key] = normalize(candidate[key]);
        }

        return output;
      } finally {
        seen.delete(candidate);
      }
    };

    return JSON.stringify(normalize(value));
  }

  isReferenceExpression(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "$from")
    );
  }

  isVariableExpression(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "$var")
    );
  }

  getRootPathSegment(path) {
    return this.parsePath(path)[0];
  }

  splitToolId(toolId) {
    const separatorIndex = toolId.indexOf("|");

    if (separatorIndex < 1) {
      return [toolId, ""];
    }

    return [
      toolId.slice(0, separatorIndex),
      toolId.slice(separatorIndex + 1)
    ];
  }

  normalizeError(error) {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  describeType(value) {
    if (Array.isArray(value)) {
      return "array";
    }

    if (value === null) {
      return "null";
    }

    return typeof value;
  }

  buildFinalOutput(toolPlan, success) {
    return {
      success,
      reason:
        toolPlan &&
          typeof toolPlan === "object" &&
          typeof toolPlan.reason === "string"
          ? toolPlan.reason
          : "",
      results: this.synthesizerResults,
      executions: this.executionRecords.map((record) => ({
        nodeId: record.nodeId,
        toolId: record.toolId,
        toolNo: record.toolNo,
        status: record.skipped
          ? "skipped"
          : record.success
            ? "success"
            : "failed",
        cached: record.cached,
        durationMs: record.durationMs,
        parameters: record.parameters,
        iterationPath: record.iterationPath,
        error: record.error
      })),
      errors: this.errors,
      error: this.failureError
    };
  }

  log({
    level = "debug",
    methodName,
    message,
    requestId,
    threadId,
    nodeId,
    serverId,
    toolId,
    toolName,
    toolNo,
    status,
    durationMs,
    parameters,
    error,
    additionalInfo
  }) {
    const lines = [
      `[%s] %s.#%s(): ${message}`
    ];

    const splat = [
      scriptName,
      this.constructor.name,
      methodName || "unknown"
    ];

    const append = (label, value, formatter) => {
      if (value === undefined || value === null) {
        return;
      }

      lines.push(`  ${label}: %s`);

      splat.push(
        formatter
          ? formatter(value)
          : String(value)
      );
    };

    append("Request ID", requestId);
    append("Thread ID", threadId);
    append("Node ID", nodeId);
    append("Server ID", serverId);
    append("Tool ID", toolId);
    append("Tool Name", toolName);
    append("Tool No", toolNo);
    append("Status", status);
    append("Duration", durationMs, (value) => `${value} ms`);

    append(
      "Parameters",
      parameters,
      (value) => JSON.stringify(value, null, 2)
    );

    append(
      "Additional Information",
      additionalInfo,
      (value) =>
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2)
    );

    append("Error", error);

    logger.log({
      level,
      message: lines.join("\n"),
      splat
    });
  }

  /**
   * Integration point for RAPID remote MCP/Web/A2A/gRPC API tool execution.
   * Invoke a remote server tool. It constructs the request based on the tool definition and parameters, 
   * sends the request to the appropriate server, and handles the response. It also includes error handling to catch and 
   * log any issues during the tool invocation process, returning a structured response indicating success or failure of the tool call.
   *
   * @param request AI Gateway (HTTP) Request object
   * @param threadId The thread id of current request
   * @param {{toolId: string, parameters: object}} srvTool An object containing the toolId (in the format "serverId|toolName") and parameters for the tool invocation. 
   * @returns {Promise<{
   *   toolId: string,
   *   results: string,
   *   success: boolean,
   *   error: string
   * }>}
   * Expected return format:
   * {
   *   toolId: "server_name|tool_name",
   *   results: "{\"customerId\":\"C1001\"}",
   *   success: true,
   *   error: ""
   * }
   */
  async invokeRemoteTool(request, threadId, srvTool) {
    // Extract the server id from the toolId (format: "serverId|toolName")
    const [serverId, toolName] = srvTool.toolId.split("|");
    const remoteServer = this.remoteServerConfig.find(srv => srv.id === serverId);
    let toolResponse;

    let sessionId = request.get(CustomRequestHeaders.SessionId);
    if (sessionId)
      sendTrace(sessionId, `Invoking Tool: <b>${toolName}</b> on Server: <b>${serverId}</b>`);

    let stTime = Date.now();
    try {
      if (!remoteServer)
        throw new Error(`Remote Server with ID ${serverId} not found for tool ${toolName}`);

      // logger.log({ level: "debug", message: "[%s] %s.#invokeRemoteTool(): Invoking remote tool.\n  Request ID: %s\n  Server ID: %s\n  Tool ID: %s\n  Parameters: %s", splat: [scriptName, this.constructor.name, request.id, serverId, toolName, JSON.stringify(srvTool.parameters, null, 2)] });

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
            results: (srvResponse.result?.structuredContent) ? JSON.stringify(srvResponse.result.structuredContent) : (callResult ? srvResponse.result?.content[0]?.text : null),
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
            results: (srvResponse) ? JSON.stringify(srvResponse) : null, // Convert the a2a agent response into a string
            success: true
          };
          break;
        case RemoteServerProtocol.WebAPI:
        case RemoteServerProtocol.gRPC:
          headers[CustomRequestHeaders.RequestId] = request.id;
          srvResponse = await this.mcpBridges.find(bridge => bridge.serverId === serverId).bridge.invoke(request.id, toolName, srvTool.parameters, headers);

          toolResponse = {
            toolId: srvTool.toolId,
            results: (srvResponse) ? JSON.stringify(srvResponse) : null, // Convert the web api / grpc server response into a string
            success: true
          };
          break;
        default:
          throw new Error(`Remote server protocol: ${remoteServer.protocol}, not supported!`);
      };

      // logger.log({ level: "debug", message: "[%s] %s.#invokeRemoteTool(): Remote tool execution completed OK.\n  Request ID: %s\n  Result: %s", splat: [scriptName, this.constructor.name, request.id, JSON.stringify(toolResponse, null, 2)] });
    }
    catch (error) {
      toolResponse = {
        toolId: srvTool.toolId,
        results: null,
        success: false,
        error: `${error.message}; Reason: ${error.bodyText ?? ''}`
      };

      logger.log({ level: "warn", message: "[%s] %s.#invokeRemoteTool(): Remote tool execution failed.\n  Request ID: %s\n  Server|Tool ID: %s\n  Node ID: %s\n  Error: %s", splat: [scriptName, this.constructor.name, request.id, srvTool.toolId, srvTool.nodeId, toolResponse.error] });

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
        srvTool.nodeId,
        srvTool.parameters,
        toolResponse.results,
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
}

module.exports = {
  ToolExecutionEngine,
  TOOL_PLAN_SCHEMA
};