
/**
 * Name: MCP server tools class
 * Description: This class loads tools from configured MCP servers for an AI Application.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-26-2025
 * Version (Introduced): 2.7.0
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

// Singleton class
class McpServerTools {
  
  constructor() {
    if (McpServerTools.instance)
      return (McpServerTools.instance);

    this.mcpServersObject = new Map();
    McpServerTools.instance = this;
  }

  /**
   * Builds and maintains a cache of MCP servers configured for this AI Gateway and tools exposed by each.
   * mcpServersObject : Map(serverId, { lastFetched: TimeInSeconds, tools: [{toolDef{}, {toolDef}, ...] })
   * 
   * Returns an array of tool definitions for an MCP Server : Array [{ name: "serverId:toolName", description ...}, {}, ...])
   */
  async getMcpServerToolsList(mcpServerId, mcpServerConfig) {
    let mcpServerObject = null;

    let mcpServer = mcpServerConfig.find(server => (server.id === mcpServerId));
    if (mcpServer) {
      const now = Date.now() / 1000;

      const serverObject = this.mcpServersObject.get(mcpServer.id);
      if (!serverObject || (now - serverObject.lastFetched > mcpServer.serverCacheTTL)) {
        this.mcpServersObject.delete(mcpServer.id); // Delete the existing cached mcp server entry if it exists

        let endpoint = `${mcpServer.uri}/tools/list`;
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              // Add authorization headers if needed
              // 'Authorization': 'Bearer YOUR_TOKEN'
            }
          });

          if (!response.ok) {
            logger.log({ level: "warn", message: "[%s] %.getMcpServerToolsList():\n  MCP Server ID: %s\n  URI: %s\n  Error: %s", splat: [scriptName, this.constructor.name, mcpServer.id, endpoint, response.status, response.statusText] });
            // throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
          }

          const toolsList = await response.json();
          if (toolsList && toolsList.length > 0) {
            const updatedToolsList = toolsList.map(tool => ({
              ...tool,
              name: mcpServer.id + ":" + tool.name
            })); // Update the name property to include the server id!

            this.mcpServersObject.set(mcpServer.id, { lastFetched: now, tools: updatedToolsList });

            mcpServerObject = {
              serverId: mcpServer.id,
              tools: updatedToolsList
            };

            logger.log({ level: "info", message: "[%s] %s.getMcpServerToolsList():\n  MCP Server ID: %s\n  Tools Registered: %d", splat: [scriptName, this.constructor.name, mcpServer.id, toolsList.length] });
          }
        }
        catch (error) {
          // console.error('Error fetching tools list:', error.message);
          logger.log({ level: "warn", message: "[%s] %.getMcpServerToolsList():\n  MCP Server ID: %s\n  URI: %s\n  Error fetching tools list: %s", splat: [scriptName, this.constructor.name, mcpServer.id, endpoint, error.message] });
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
   * @param {String} aiApp AI Application
   * @param {Object} mcpServerConfig MCP Server Configuration Object
   * @returns [ {serverId: , tools: []}, ...]
   */
  async getMcpServerToolsForAiApp(aiApp, mcpServerConfig) {
    let mcpServersObj = new Array();

    aiApp.mcpServerSettings.serverIds.forEach( async (srvId) => {
      const serverObject = await this.getMcpServerToolsList(srvId, mcpServerConfig);
      if ( serverObject )
        mcpServersObj.push(serverObject);
    });

    return (mcpServersObj);
  }
}

module.exports = {
  McpServerTools
}