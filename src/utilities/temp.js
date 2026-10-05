// File: routes/mcpCompletion.js (Updated to use native Fetch API instead of axios)
const express = require('express');
const router = express.Router();
const { OpenAIClient, AzureKeyCredential } = require('@azure/ai-openai');
const config = require('../config/api-router-config.json');
const logger = require('../utils/logger');
const { cacheResponse, getCachedResponse } = require('../utils/semanticCache'); // Assuming cache utils

// Azure OpenAI client setup
const openaiClient = new OpenAIClient(
  config.azureOpenAI.endpoint,
  new AzureKeyCredential(config.azureOpenAI.apiKey)
);

// MCP config
const mcpConfig = {
  serverUrl: config.mcp?.serverUrl || 'https://mcp.example.com',
  authToken: config.mcp?.authToken || 'your-mcp-token',
  toolCacheTTL: 3600,
  maxToolsPerQuery: config.mcp?.maxToolsPerQuery || 5
};

// In-memory tool cache
let toolCache = { tools: [], lastFetched: 0 };

// Helper: Generate unique JSON-RPC request ID
let requestIdCounter = 0;
function nextRpcId() {
  return ++requestIdCounter;
}

// Fetch MCP tools using JSON-RPC tools/list
async function fetchMcpTools() {
  const now = Date.now() / 1000;
  if (now - toolCache.lastFetched < mcpConfig.toolCacheTTL) {
    return toolCache.tools;
  }

  try {
    const rpcRequest = {
      jsonrpc: "2.0",
      id: nextRpcId(),
      method: "tools/list",
      params: {}
    };

    const response = await fetch(mcpConfig.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mcpConfig.authToken}`
      },
      body: JSON.stringify(rpcRequest)
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} ${response.statusText}`);
    }

    const rpcResponse = await response.json();

    if (rpcResponse.jsonrpc !== "2.0" || rpcResponse.id !== rpcRequest.id) {
      throw new Error("Invalid JSON-RPC response format");
    }

    if (rpcResponse.error) {
      throw new Error(`MCP error: ${rpcResponse.error.message} (code: ${rpcResponse.error.code})`);
    }

    // Normalize tools (some servers return array directly, some use { tools: [...] })
    const tools = rpcResponse.result?.tools || rpcResponse.result || [];
    toolCache.tools = Array.isArray(tools) ? tools : [];
    toolCache.lastFetched = now;

    logger.info(`Fetched ${toolCache.tools.length} MCP tools`);
    return toolCache.tools;
  } catch (error) {
    logger.error('MCP tools/list failed', error);
    return [];
  }
}

// Invoke a single MCP tool using JSON-RPC tools/call
async function invokeMcpTool(tool) {
  try {
    const rpcRequest = {
      jsonrpc: "2.0",
      id: nextRpcId(),
      method: "tools/call",
      params: {
        name: tool.toolId || tool.name, // support both naming styles
        arguments: tool.parameters
      }
    };

    const response = await fetch(mcpConfig.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mcpConfig.authToken}`
      },
      body: JSON.stringify(rpcRequest)
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} ${response.statusText}`);
    }

    const rpcResponse = await response.json();

    if (rpcResponse.jsonrpc !== "2.0" || rpcResponse.id !== rpcRequest.id) {
      throw new Error("Invalid JSON-RPC response format");
    }

    if (rpcResponse.error) {
      throw new Error(`Tool call failed: ${rpcResponse.error.message} (code: ${rpcResponse.error.code})`);
    }

    return {
      toolId: tool.toolId || tool.name,
      result: rpcResponse.result,
      success: true
    };
  } catch (error) {
    logger.error(`Tool invocation failed: ${tool.toolId || tool.name}`, error);
    return {
      toolId: tool.toolId || tool.name,
      result: null,
      success: false,
      error: error.message
    };
  }
}

// Enhanced LLM prompt for multi-tool selection and planning
const toolSelectorPrompt = (query, tools) => `
Given the user query: "${query}"
And available MCP tools (with output schemas): ${JSON.stringify(tools, null, 2)}
Plan and select one or more tools to handle the query. Return a JSON object with:
- plan: string ("parallel" for concurrent invocation, or JSON array of sequences like [["tool1", "tool2"]] for sequential chains)
- tools: array of objects [{ toolId: string, parameters: object (can be nested), dependsOn: array of prior toolIds (for sequential)}] (empty if no tools fit)
- reason: string (why these tools/plan or why none)
If no tools match, return { plan: "none", tools: [], reason: "No suitable tools found" }.
For sequential, use placeholders in parameters for dependencies, e.g., "{prevToolId.output}" for the entire output object, or "{prevToolId.output.path.to.key}" for nested values. Leverage output schemas to ensure compatibility.
`;

// Synthesis prompt for final response
const synthesisPrompt = (query, toolResults) => `
Using these tool results: ${JSON.stringify(toolResults, null, 2)}
Generate a concise, final response to the user query: "${query}"
`;

// Enhanced dependency resolution: Recursively replace placeholders
function resolveParameters(parameters, toolResults) {
  if (typeof parameters !== 'object' || parameters === null) {
    return parameters;
  }

  if (Array.isArray(parameters)) {
    return parameters.map(item => resolveParameters(item, toolResults));
  }

  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        const placeholder = value.slice(1, -1);
        const [toolId, ...pathParts] = placeholder.split('.');
        if (pathParts[0] === 'output') {
          let resolved = toolResults[toolId]?.result;
          for (const part of pathParts.slice(1)) {
            resolved = resolved?.[part];
          }
          return [key, resolved ?? value];
        }
      } else if (typeof value === 'object') {
        return [key, resolveParameters(value, toolResults)];
      }
      return [key, value];
    })
  );
}

router.post('/mcp/complete', async (req, res) => {
  const { query, sessionId } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    // Check cache
    const cached = await getCachedResponse(query, sessionId);
    if (cached) {
      logger.info('Cache hit', { query, sessionId });
      return res.json({ response: cached, source: 'cache' });
    }

    // Fetch tools
    const tools = await fetchMcpTools();

    // LLM selects tools and plan
    const selectionCompletion = await openaiClient.getChatCompletions(
      config.azureOpenAI.deploymentName,
      [
        { role: 'system', content: toolSelectorPrompt(query, tools) },
        { role: 'user', content: query }
      ],
      { maxTokens: 1000, temperature: 0.3 }
    );

    const toolPlan = JSON.parse(selectionCompletion.choices[0].message.content);
    logger.info('Tool plan', { query, toolPlan });

    if (toolPlan.tools.length > mcpConfig.maxToolsPerQuery) {
      throw new Error(`Too many tools selected (${toolPlan.tools.length}); limit is ${mcpConfig.maxToolsPerQuery}`);
    }

    if (!toolPlan.tools.length) {
      // Fallback to direct OpenAI
      const fallback = await openaiClient.getChatCompletions(
        config.azureOpenAI.deploymentName,
        [{ role: 'user', content: query }],
        { maxTokens: 1000 }
      );
      const response = fallback.choices[0].message.content;
      await cacheResponse(query, sessionId, response);
      return res.json({ response, source: 'openai' });
    }

    // Invoke tools based on plan
    let toolResults = {};
    if (toolPlan.plan === 'parallel') {
      const invocations = await Promise.all(toolPlan.tools.map(invokeMcpTool));
      invocations.forEach(inv => { toolResults[inv.toolId] = inv; });
    } else if (Array.isArray(toolPlan.plan)) {
      for (const sequence of toolPlan.plan) {
        for (const toolId of sequence) {
          const tool = toolPlan.tools.find(t => t.toolId === toolId);
          if (tool.dependsOn?.length) {
            tool.parameters = resolveParameters(tool.parameters, toolResults);
          }
          const result = await invokeMcpTool(tool);
          toolResults[toolId] = result;
        }
      }
    } else {
      throw new Error('Invalid plan');
    }

    // Synthesize final response
    const synthesisCompletion = await openaiClient.getChatCompletions(
      config.azureOpenAI.deploymentName,
      [
        { role: 'system', content: synthesisPrompt(query, toolResults) },
        { role: 'user', content: query }
      ],
      { maxTokens: 1500, temperature: 0.5 }
    );

    const finalResponse = synthesisCompletion.choices[0].message.content;

    await cacheResponse(query, sessionId, finalResponse);
    res.json({ response: finalResponse, toolsUsed: Object.keys(toolResults), source: 'mcp-multi' });
  } catch (error) {
    logger.error('Multi-tool completion failed', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;