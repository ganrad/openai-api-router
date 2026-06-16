/**
 * Name: MCP server tools class
 * Description: This class loads tools from configured remote servers for an AI Application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-17-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 * ID02232026: ganrad: v3.0.1: (Enhancement) Introduced MCP Server tools integration. This feature integrates MCP tool invocation into the 
 * inference processing pipeline, allowing additional context to be supplied to the LLM to improve response quality.
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const {
  RemoteServerProtocol,
  McpServerAuthTypes,
  McpMethods
} = require("./app-gtwy-constants.js");
const { getMcpServerResponse } = require("./mcp-client.js");
const { OpenApiMcpBridge } = require("./openapi-mcp-bridge.js");
const { GrpcMcpBridge } = require("./grpc-mcp-bridge.js");

// Singleton class
class RemoteServerTools {

  static get DEFAULT_TTL_CACHE() {
    return(3600); // Default TTL for Tools cache is 60 minutes.
  }

  constructor() {
    if (RemoteServerTools.instance)
      return (RemoteServerTools.instance);

    this.remoteServersObject = new Map();  // In-memory tools cache
    RemoteServerTools.instance = this;
  }

  /**
   * Builds and maintains a cache of remote MCP servers configured for this AI Gateway and tools exposed by each.
   * this.remoteServersObject : Map(serverId, { lastFetched: TimeInSeconds, tools: [{toolDef}, {toolDef}, ...] })
   * 
   * Returns an Remote Server object : { serverId: "server-id", protocol: "[MCP|OpenAPI|gRPC]", tools: [ {name: "server-id|tool-name", ...}, {}, ...] }
   */
  async #getMcpServerToolsList(requestid, mcpServer) {
    let mcpServerObject = null;

    try {
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
        params: (listToolsMethod) ? { name: listToolsMethod } : {}, // If uriToFetchToolSchemas is defined, we use TOOLS_CALL with the method name as param. Otherwise, we use TOOLS_LIST with no params.
      });

      // Normalize tools (some servers return array directly, some use { tools: [...]} )
      const toolsList = rpcResponse.result?.tools || rpcResponse.result || [];
      // console.log("******** Tools list fetched and cached for MCP Server ID:", mcpServer.id, "Tools count:", toolsList.length); // Debug log to check the tools count fetched
      // console.log("******** Tools list fetched and cached for MCP Server ID:", mcpServer.id, "listToolsMethod:", listToolsMethod, "Tools:", JSON.stringify(toolsList, null, 2)); // Debug log to check the tools fetched

      const now = Date.now() / 1000;
      if (Array.isArray(toolsList) && toolsList.length > 0) { // Handle case where tools are returned as an array (traditional response) - tools/list method
        const updatedToolsList = toolsList.map(tool => ({
          ...tool,
          name: mcpServer.id + "|" + tool.name
        })); // Update the name property to include the server id!

        this.remoteServersObject.set(mcpServer.id, { lastFetched: now, protocol: mcpServer.protocol, tools: updatedToolsList });

        mcpServerObject = {
          serverId: mcpServer.id,
          protocol: mcpServer.protocol,
          tools: updatedToolsList
        };

        logger.log({ level: "debug", message: "[%s] %s.#getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  Tools Registered: %d", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, toolsList.length] });
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
            this.remoteServersObject.set(mcpServer.id, { lastFetched: now, protocol: mcpServer.protocol, tools: updatedToolsList });

            mcpServerObject = {
              serverId: mcpServer.id,
              protocol: mcpServer.protocol,
              tools: updatedToolsList
            };

            logger.log({ level: "debug", message: "[%s] %s.#getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  Tools Registered (from content): %d", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, updatedToolsList.length] });
          }
          catch (err) {
            logger.log({ level: "warn", message: "[%s] %s.#getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  Warning: Failed to parse tools from content. Error: %s\n  Tools String: %s", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, err.message, toolsString] });
            parsedTools = null;
          };
        };
      }
      else {
        logger.log({ level: "warn", message: "[%s] %s.#getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  URI: %s\n  Method: %s\n  Warning: No tools found in response", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, mcpServer.uri, McpMethods.TOOLS_LIST] });
      };
    }
    catch (error) {
      // console.error('Error fetching tools list:', error.message);
      logger.log({ level: "warn", message: "[%s] %s.#getMcpServerToolsList():\n  Request ID: %s\n  MCP Server ID: %s\n  URI: %s\n  Error fetching tools list: %s", splat: [scriptName, this.constructor.name, requestid, mcpServer.id, mcpServer.uri, error.message] });
    };

    return (mcpServerObject);
  }

  async #getWebApiToolsList(reqid, webApiServer) {
    let openAPIServerObject = null;

    let specUrl = webApiServer.uri;
    specUrl = specUrl.concat(webApiServer.uriToFetchToolSchemas || "/api-docs");
    try {
      const openapiBridge = new OpenApiMcpBridge({ specUrl, auth: { type: McpServerAuthTypes.ApiKey, keyName: webApiServer.auth.keyName, keyValue: webApiServer.auth.keyValue } });
      // console.log(`******** OpenAPI spec initialized for MCP Server ID: ${remoteServer.id}, Spec URI: ${specUrl}`); // Debug log to check if the OpenAPI spec was initialized
      await openapiBridge.initialize(); // Initialize the OpenAPI - MCP bridge
      const toolsList = openapiBridge.getMcpTools(); // Get the tools from the OpenAPI spec

      const now = Date.now() / 1000;
      if (Array.isArray(toolsList) && toolsList.length > 0) { // Tools are returned as an array
        const updatedToolsList = toolsList.map(tool => ({
          ...tool,
          name: webApiServer.id + "|" + tool.name
        })); // Update the name property to include the server id!

        // Print only the names of the tools fetched for debugging
        console.log("******** Tools list fetched and cached for Web API Server ID:", webApiServer.id, "Tool Names:", updatedToolsList.map(t => t.name)); // Debug log to check the tool names fetched
        this.remoteServersObject.set(webApiServer.id, { lastFetched: now, protocol: webApiServer.protocol, tools: updatedToolsList, bridge: openapiBridge });

        openAPIServerObject = {
          serverId: webApiServer.id,
          protocol: webApiServer.protocol,
          tools: updatedToolsList,
          bridge: openapiBridge
        };
        // logger.log({ level: "debug", message: "[%s] %s.#getWebApiToolsList():\n  Request ID: %s\n  Web Api Server ID: %s\n  Spec URI: %s\n  Tools Registered: %d\n  Tool Defs:\n  %s", splat: [scriptName, this.constructor.name, reqid, webApiServer.id, specUrl, toolsList.length, JSON.stringify(toolsList, null, 2)] });
        logger.log({ level: "debug", message: "[%s] %s.#getWebApiToolsList():\n  Request ID: %s\n  Web Api Server ID: %s\n  Spec URI: %s\n  Tools Registered: %d", splat: [scriptName, this.constructor.name, reqid, webApiServer.id, specUrl, toolsList.length] });
      };
    }
    catch (error) {
      logger.log({ level: "warn", message: "[%s] %s.#getWebApiToolsList():\n  Request ID: %s\n  Web Api Server ID: %s\n  Spec URI: %s\n  Error fetching tools list: %s", splat: [scriptName, this.constructor.name, reqid, webApiServer.id, specUrl, error.message] });
    };

    return(openAPIServerObject);
  }

  async #getGrpcServerToolsList(reqid, grpcServer) {
    let grpcServerObject = null;

    try {
      const grpcBridge = new GrpcMcpBridge(
        {
          protoPath: grpcServer.uriToFetchToolSchemas,
          serviceUrl: grpcServer.uri,
          auth: { type: McpServerAuthTypes.ApiKey, keyName: grpcServer.auth.keyName, keyValue: grpcServer.auth.keyValue } 
        }
      );

      await grpcBridge.initialize(); // Initialize the gRPC - MCP bridge
      const toolsList = grpcBridge.getMcpTools(); // Get the tools from the gRPC proto definition

      const now = Date.now() / 1000;
      if (Array.isArray(toolsList) && toolsList.length > 0) { // Tools are returned as an array
        const updatedToolsList = toolsList.map(tool => ({
          ...tool,
          name: grpcServer.id + "|" + tool.name
        })); // Update the name property to include the server id!

        // Print only the names of the tools fetched for debugging
        console.log("******** Tools list fetched and cached for gRPC Server ID:", grpcServer.id, "Tool Names:", updatedToolsList.map(t => t.name)); // Debug log to check the tool names fetched
        this.remoteServersObject.set(grpcServer.id, { lastFetched: now, protocol: grpcServer.protocol, tools: updatedToolsList, bridge: grpcBridge });

        grpcServerObject = {
          serverId: grpcServer.id,
          protocol: grpcServer.protocol,
          tools: updatedToolsList,
          bridge: grpcBridge
        };
        logger.log({ level: "debug", message: "[%s] %s.#getGrpcServerToolsList():\n  Request ID: %s\n  gRPC Server ID: %s\n  Server URI: %s\n  Proto URI: %s\n  Tools Registered: %d", splat: [scriptName, this.constructor.name, reqid, grpcServer.id, grpcServer.uri, grpcServer.uriToFetchToolSchemas, toolsList.length] });
      };
    }
    catch (error) {
      logger.log({ level: "warn", message: "[%s] %s.#getGrpcServerToolsList():\n  Request ID: %s\n  gRPC Server ID: %s\n  Server URI: %s\n  Error fetching tools list: %s", splat: [scriptName, this.constructor.name, reqid, grpcServer.id, grpcServer.uri, error.message] });
    };

    return(grpcServerObject);
  }

  async #getRemoteServerToolsList(requestid, remoteServerId, remoteServerConfig) {
    let remoteServerObject = null;

    let remoteServer = remoteServerConfig.find(server => (server.id === remoteServerId));
    // console.log("******** Fetching tools for MCP Server ID:", mcpServer.id); // Debug log to check the server id being fetched
    // console.log("******** Auth type:", mcpServer.auth.authType); // Debug log to check the auth type
    if (remoteServer) {
      const now = Date.now() / 1000;

      const serverObject = this.remoteServersObject.get(remoteServer.id);
      const toolsTtl = remoteServer.serverCacheTTL || RemoteServerTools.DEFAULT_TTL_CACHE;
      if (!serverObject || (now - serverObject.lastFetched > toolsTtl)) {
        this.remoteServersObject.delete(remoteServer.id); // Delete the existing cached remote server entry if it exists
        switch (remoteServer.protocol) {
          case RemoteServerProtocol.Mcp:
            remoteServerObject = await this.#getMcpServerToolsList(requestid, remoteServer);
            break;
          case RemoteServerProtocol.WebAPI:
            remoteServerObject = await this.#getWebApiToolsList(requestid, remoteServer);
            break;
          case RemoteServerProtocol.gRPC:
            remoteServerObject = await this.#getGrpcServerToolsList(requestid, remoteServer);
            break;
        };
      }
      else
        remoteServerObject = {
          serverId: remoteServer.id,
          protocol: remoteServer.protocol,
          tools: serverObject.tools,
          ...(serverObject.bridge && { bridge: serverObject.bridge })
        };
    };

    return (remoteServerObject);
  };

  /**
   * Returns an array of remote server objects (& associated tools) configured for an AI App
   * 
   * @param {String} requestId Unique request ID for logging and tracing
   * @param {String} aiAppRemoteServerConfig Remote Server configuration object defined at the AI App level
   * @param {Object} remoteServerConfig Remote Servers Configuration Object
   * @returns [ {serverId: , tools: []}, ...]
   */
  async getRemoteServerToolsForAiApp(requestId, aiAppRemoteServerConfig, remoteServerConfig) {
    if (!remoteServerConfig || remoteServerConfig.length === 0) {
      logger.log({ level: "debug", message: "[%s] %s.getRemoteServerToolsForAiApp(): No Remote Servers configured at the gateway level.", splat: [scriptName, this.constructor.name] });
      return (null);
    };

    // --------------------------------------------------------------
    // Parallel fetch of all remote server tools.
    // Using Promise.all keeps the order of `serverIds`.
    // --------------------------------------------------------------
    const serverPromises = aiAppRemoteServerConfig.servers.map(async (remoteserver) => {
      try {
        // `getMcpServerToolsList` is assumed to return either an object or null/undefined.
        const serverObject = await this.#getRemoteServerToolsList(requestId, remoteserver.serverId, remoteServerConfig);
        return serverObject; // may be null → filtered out later
      }
      catch (err) {
        // Log the error but *don’t* abort the whole operation.
        logger.log({ level: "warn", message: "[%s] %s.#getRemoteServerToolsForAiApp():\n  Failed to fetch tools. Request ID: %s\n  Remote Server ID: %s\n  Error: %s", splat: [scriptName, this.constructor.name, requestId, remoteserver.serverId, err.message] });

        return null; // treat as “not found”
      }
    });

    // Wait for every promise to settle.
    const rawResults = await Promise.all(serverPromises);

    // --------------------------------------------------------------
    // Filter out any falsy results (null/undefined) and return.
    // --------------------------------------------------------------
    let remoteServersObj = rawResults.filter(Boolean); // keeps only truthy objects

    // Check for allowed tools and filter tools list if needed
    remoteServersObj.forEach(server => {
      const allowedToolsForServer = aiAppRemoteServerConfig.servers.find(srv => srv.serverId === server.serverId)?.allowedTools;
      if (allowedToolsForServer && allowedToolsForServer.length > 0) {
        server.tools = server.tools.filter(tool => allowedToolsForServer.includes(tool.name.split("|")[1])); // tool.name format is "serverId|toolName"
      }
    });

    return remoteServersObj.length ? remoteServersObj : null;
  }
}

module.exports = {
  RemoteServerTools
}