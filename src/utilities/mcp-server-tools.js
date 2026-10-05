/**
 * Name: MCP server tools class
 * Description: This class loads tools from configured MCP servers for an AI Application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-26-2025
 * Version (Introduced): 2.7.0
 *
 * Notes:
 * ID02232026: ganrad: v3.0.1: (Enhancement) Introduced MCP Server tools integration. This feature integrates MCP tool invocation into the 
 * inference processing pipeline, allowing supplemental context to be supplied to the LLM to improve response quality.
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const {
  McpServerAuthTypes,
  McpMethods
} = require("./app-gtwy-constants.js");
const { getMcpServerResponse } = require("./mcp-client.js");

// Singleton class
class McpServerTools {

  constructor() {
    if (McpServerTools.instance)
      return (McpServerTools.instance);

    this.mcpServersObject = new Map();  // In-memory tools cache
    McpServerTools.instance = this;
  }

  /**
   * Builds and maintains a cache of MCP servers configured for this AI Gateway and tools exposed by each.
   * mcpServersObject : Map(serverId, { lastFetched: TimeInSeconds, tools: [{toolDef{}, {toolDef}, ...] })
   * 
   * Returns an array of tool definitions for an MCP Server : Array [{ name: "serverId:toolName", description ...}, {}, ...])
   */
  async getMcpServerToolsList(requestid, mcpServerId, mcpServerConfig) {
    let mcpServerObject = null;

    let mcpServer = mcpServerConfig.find(server => (server.id === mcpServerId));
    // console.log("******** Fetching tools for MCP Server ID:", mcpServer.id); // Debug log to check the server id being fetched
    // console.log("******** Auth type:", mcpServer.auth.authType); // Debug log to check the auth type
    if (mcpServer) {
      const now = Date.now() / 1000;

      const serverObject = this.mcpServersObject.get(mcpServer.id);
      if (!serverObject || (now - serverObject.lastFetched > mcpServer.serverCacheTTL)) {
        this.mcpServersObject.delete(mcpServer.id); // Delete the existing cached mcp server entry if it exists

        try {
          /*
          const rpcRequest = {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: this.#nextRpcId(),
            method: McpMethods.TOOLS_LIST,
            params: {}
          };
          const acceptHeader = MimeTypes.Json + ", " + MimeTypes.EventStream; // Accept both JSON and Event Stream responses
          let headers = {
            [HttpHeaders.ContentType]: MimeTypes.Json,
            [HttpHeaders.Accept]: acceptHeader
          };
          */

          let headers = {};

          if (mcpServer.auth.authType === McpServerAuthTypes.ApiKey)
            headers[mcpServer.auth.keyName] = mcpServer.auth.keyValue;

          // console.log("******** Fetching tools list with RPC Request:", JSON.stringify(rpcRequest, null, 2)); // Debug log to check the RPC request being sent
          // console.log("******** Fetching tools list with Headers:", JSON.stringify(headers, null, 2)); // Debug log to check the headers being sent

          /*
          const response = await fetch(mcpServer.uri, {
            method: HttpMethods.POST,
            headers,
            body: JSON.stringify(rpcRequest)
          });

          // Iterate over the headers and print each one
          console.log("**** Response Headers: *****"); // Debug log to check the response headers
          for (const [name, value] of response.headers) {
            console.log(`${name}: ${value}`);
          };
          console.log("************");

          if (!response.ok) {
            logger.log({ level: "warn", message: "[%s] %s.getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  URI: %s\n  Method: %s\n  Status: %s\n  Error: %s", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, mcpServer.uri, McpMethods.TOOLS_LIST, response.status, response.statusText] });
            throw new Error(`MCP Server id: ${mcpServer.id}, responded with ${response.status}: ${response.statusText}`);
          };

          const rpcResponse = await response.json();

          if (rpcResponse.jsonrpc !== A2AProtocolAttributes.JsonRpcVersion || rpcResponse.id !== rpcRequest.id)
            throw new Error('Invalid JSON-RPC response format');

          if (rpcResponse.error)
            throw new Error(`MCP Server Error: ${rpcResponse.error.message} (code: ${rpcResponse.error.code})`);
          */
          const listToolsMethod = mcpServer.uriToFetchToolSchemas;
          const rpcResponse = await getMcpServerResponse({
            endpointUrl: mcpServer.uri,
            method: (listToolsMethod) ? McpMethods.TOOLS_CALL : McpMethods.TOOLS_LIST,
            headers,
            params: (listToolsMethod) ? { name: listToolsMethod } : {}, // If methodToFetchToolSchemas is defined, we use TOOLS_CALL with the method name as param. Otherwise, we use TOOLS_LIST with no params.
          });

          // Normalize tools (some servers return array directly, some use { tools: [...]} )
          const toolsList = rpcResponse.result?.tools || rpcResponse.result || [];
          // console.log("******** Tools list fetched and cached for MCP Server ID:", mcpServer.id, "Tools count:", toolsList.length); // Debug log to check the tools count fetched
          // console.log("******** Tools list fetched and cached for MCP Server ID:", mcpServer.id, "listToolsMethod:", listToolsMethod, "Tools:", JSON.stringify(toolsList, null, 2)); // Debug log to check the tools fetched

          if (Array.isArray(toolsList) && toolsList.length > 0) { // Handle case where tools are returned as an array (traditional response) - tools/list method
            const updatedToolsList = toolsList.map(tool => ({
              ...tool,
              name: mcpServer.id + "|" + tool.name
            })); // Update the name property to include the server id!

            this.mcpServersObject.set(mcpServer.id, { lastFetched: now, tools: updatedToolsList });

            mcpServerObject = {
              serverId: mcpServer.id,
              tools: updatedToolsList
            };

            logger.log({ level: "debug", message: "[%s] %s.getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  Tools Registered: %d", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, toolsList.length] });
          }
          else if (toolsList.content?.length > 0) {
            const toolsString = toolsList.content[0].text; // Assuming the tools are in the first content item and under a "text" property - this may need to be adjusted based on actual response structure
            if (toolsString) {
              let parsedTools;
              try {
                parsedTools = JSON.parse(toolsString);

                // Handle case where tools are returned in a "content" property (e.g., for large tool lists or streaming responses) - tools/call method
                const updatedToolsList = parsedTools.tools?.map(tool => ({
                  ...tool,
                  name: mcpServer.id + "|" + tool.name
                })); // Update the name property to include the server id!
                this.mcpServersObject.set(mcpServer.id, { lastFetched: now, tools: updatedToolsList });

                mcpServerObject = {
                  serverId: mcpServer.id,
                  tools: updatedToolsList
                };

                logger.log({ level: "debug", message: "[%s] %s.getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  Tools Registered (from content): %d", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, updatedToolsList.length] });
              }
              catch (err) {
                logger.log({ level: "warn", message: "[%s] %s.getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  Warning: Failed to parse tools from content. Error: %s\n  Tools String: %s", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, err.message, toolsString] });
                parsedTools = null;
              };
            };
          }
          else {
            logger.log({ level: "warn", message: "[%s] %s.getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  URI: %s\n  Method: %s\n  Warning: No tools found in response", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, mcpServer.uri, McpMethods.TOOLS_LIST] });
          };
        }
        catch (error) {
          // console.error('Error fetching tools list:', error.message);
          logger.log({ level: "warn", message: "[%s] %s.getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  URI: %s\n  Error fetching tools list: %s", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, mcpServer.uri, error.message] });
        };
      }
      else
        mcpServerObject = {
          serverId: mcpServer.id,
          tools: serverObject.tools
        };
    };

    return (mcpServerObject);
  };

  /**
   * Returns an array of MCP server objects (& associated tools) configured for an AI App
   * 
   * @param {String} requestId Unique request ID for logging and tracing
   * @param {String} aiAppMcpServerConfig MCP Server configuration object defined at the AI App level
   * @param {Object} mcpServerConfig MCP Server Configuration Object
   * @returns [ {serverId: , tools: []}, ...]
   */
  async getMcpServerToolsForAiApp(requestId, aiAppMcpServerConfig, mcpServerConfig) {
    if (!mcpServerConfig || mcpServerConfig.length === 0) {
      logger.log({ level: "debug", message: "[%s] %s.getMcpServerToolsForAiApp(): No MCP Servers configured at the gateway level.", splat: [scriptName, this.constructor.name] });
      return (null);
    };

    // let mcpServersObj = null

    // console.log("******** AI App MCP Server Config:", JSON.stringify(aiAppMcpServerConfig, null, 2)); // Debug log to check the config
    // console.log("******** Global MCP Server Config:", JSON.stringify(mcpServerConfig, null, 2)); // Debug log to check the config

    /*
    await aiAppMcpServerConfig?.serverIds.forEach(async (srvId) => {
      const serverObject = await this.getMcpServerToolsList(srvId, mcpServerConfig);
      if (serverObject) {
        if (!mcpServersObj)
          mcpServersObj = [];
        mcpServersObj.push(serverObject);
      };
    }); */

    // --------------------------------------------------------------
    // Parallel fetch of all mcp server tools.
    // Using Promise.all keeps the order of `serverIds`.
    // --------------------------------------------------------------
    const serverPromises = aiAppMcpServerConfig.servers.map(async (mcpserver) => {
      try {
        // `getMcpServerToolsList` is assumed to return either an object or null/undefined.
        const serverObject = await this.getMcpServerToolsList(requestId, mcpserver.serverId, mcpServerConfig);
        return serverObject; // may be null → filtered out later
      }
      catch (err) {
        // Log the error but *don’t* abort the whole operation.
        logger.log({ level: "warn", message: "[%s] %s.getMcpServerToolsForAiApp():\n  Failed to fetch tools. Request ID: %s\n  MCP Server ID: %s\n  Error: %s", splat: [scriptName, this.constructor.name, requestId, mcpserver.serverId, err.message] });

        return null; // treat as “not found”
      }
    });

    // Wait for every promise to settle.
    const rawResults = await Promise.all(serverPromises);

    // --------------------------------------------------------------
    // Filter out any falsy results (null/undefined) and return.
    // --------------------------------------------------------------
    let mcpServersObj = rawResults.filter(Boolean); // keeps only truthy objects

    // Check for allowed tools and filter tools list if needed
    mcpServersObj.forEach(server => {
      const allowedToolsForServer = aiAppMcpServerConfig.servers.find(srv => srv.serverId === server.serverId)?.allowedTools;
      if (allowedToolsForServer && allowedToolsForServer.length > 0) {
        server.tools = server.tools.filter(tool => allowedToolsForServer.includes(tool.name.split("|")[1])); // tool.name format is "serverId|toolName"
      }
    });

    return mcpServersObj.length ? mcpServersObj : null;
  }
}

module.exports = {
  McpServerTools
}