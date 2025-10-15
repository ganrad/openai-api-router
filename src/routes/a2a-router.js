/**
 * Name: A2A Router
 * Description: This API router adds support for A2A (Agent to Agent) protocol v0.3.0. This router includes a separate set of endpoints for discovering 
 * AI Applications as Agents using A2A.  Essentially this router exposes the AI Applications deployed on the AI Gateway instance as Agents thru the A2A 
 * discovery endpoints.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-03-2024
 * Version (Introduced): v2.7.0
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require("../utilities/logger.js");

const express = require('express');
const {
  A2AProtocolAttributes,
  DefaultJsonParserCharLimit,
  GatewayRouterEndpoints
} = require("../utilities/app-gtwy-constants.js");

function createA2AGatewayRouter(applications = []) {
  const router = express.Router();
  router.use(express.json({ limit: DefaultJsonParserCharLimit }));

  // ---- GET Agent Registry ----
  // /agents/.well-known/agents.json
  router.get(GatewayRouterEndpoints.A2AEndpoint + '/.well-known/agents.json', (req, res) => {
    const agents = applications.map(app => ({
      name: app.appId,
      description: app.description,
      state: app.isActive,
      a2a: {
        schema_version: A2AProtocolAttributes.Version,
        endpoints: {
          card: `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/.well-known/${app.appId}.json`,
          url: `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/${app.appId}/${A2AProtocolAttributes.MethodInvoke}`,
        }
      }
    }));

    res.json({
      agents
    });
  });

  // ---- GET Individual Agent Cards ----
  // /agents/.well-known/{agent-id}.json
  router.get(GatewayRouterEndpoints.A2AEndpoint + "/.well-known/:app_id" + ".json", (req, res) => {
    let appId = req.params.app_id;
    let application = (appId && applications.length) ? applications.find(app => app.appId === appId) : null;

    // Check if AI Application loaded in app context
    if (!application) {
      const err_obj = {
        http_code: 404, // Resource not found!
        result: {
          json: A2AProtocolAttributes.JsonRpcVersion,
          error: {
            message: `AI Agent with ID [${appId}] not found. Unable to process request.`,
            code: -32602 // Invalid Parameters
          }
        }
      };

      res.status(err_obj.http_code).json(err_obj.result);
      return;
    };

    if (!application.isActive) {
      const err_obj = {
        http_code: 400, // Bad Request
        result: {
          json: A2AProtocolAttributes.JsonRpcVersion,
          error: {
            message: `AI Agent with ID [${appId}] is currently in-active. Unable to process request.`,
            code: -32602 // Invalid Parameters
          }
        }
      };

      res.status(err_obj.http_code).json(err_obj.result);
      return;
    };

    const agentCard = {
      protocolVersion: A2AProtocolAttributes.Version,
      name: application.name || application.appId,
      description: application.description,
      url: `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/${application.appId}/${A2AProtocolAttributes.MethodInvoke}`,
      preferredTransport: A2AProtocolAttributes.DefaultTransport,
      provider: {
        organization: "AI Application Gateway",
        url: "https://github.com/ganrad/openai-api-router"
      },
      capabilities: {
        streaming: true,
        pushNotifications: false
      },
      defaultInputModes: ["application/json", "text/plain"],
      defaultOutputModes: ["application/json"],
      skills: [{ // Write a function to get the mcp server (tool) tags!
        id: application.appId,
        name: application.name || '',
        description: `App Type: ${application.appType}; Enabled Features: Cache=${application?.cacheSettings?.useCache ?? false}, Memory=${application?.memorySettings?.useMemory ?? false}, Personalization=${application?.personalizationSettings?.userMemory ?? false}, Budgeting=${application?.budgetSettings?.useBudget ?? false}`,
        tags: "chat-completion"
      }],
      /*
      securitySchemes: {
        msft: {
          type: "openIdConnect",
          openIdConnectUrl: "https://login.microsoftonline.com/<TenantID>/v2.0/.well-known/openid-configuration"
        }
      },
      security: [{ "msft": ["openid", "profile", "email"] }],
      */
      version: application.version || '1.0.0'
    };

    logger.log({ level: "debug", message: "[%s] createA2AGatewayRouter():\n  Request ID: %s\n  Agent ID: %s\n  Card:\n%s", splat: [scriptName, req.id, appId, JSON.stringify(agentCard, null, 2)] });

    res.json(agentCard);
  });

  return router;
}

module.exports = { createA2AGatewayRouter };