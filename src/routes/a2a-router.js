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
 * ID10252025: ganrad: v2.8.5: (Enhancement) Updated gateway security. New workflow supports - OAuth Code Flow + OIDC (User delegated) + 
 * Client Credentials (Daemon, S2S/M2M) + Bearer JWT definition & verification.
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

const { permissionsConfig, securityConfig } = require("../auth/securityConfig.js"); // ID10252025.n

// Set these values as per your organization needs!
const Organization = "AI Application Gateway";
const OrgUrl = "https://github.com/ganrad/openai-api-router";

const agentHost = (req) => {
  return (process.env.CONTAINER_APP_HOSTNAME ? `https://${process.env.CONTAINER_APP_HOSTNAME}` : `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}`);
}

function createA2AGatewayRouter(applications = []) {
  const router = express.Router();
  router.use(express.json({ limit: DefaultJsonParserCharLimit }));

  // ---- GET Agent Registry ----
  // /agents/.well-known/agents.json
  router.get(GatewayRouterEndpoints.A2AEndpoint + '/.well-known/agents.json', (req, res) => {
    const agents = applications.filter(app => app.isActive && app.exposeA2AEndpoint).map(app => ({
      name: app.appId,
      description: app.description,
      state: app.isActive,
      a2a: {
        schema_version: A2AProtocolAttributes.Version,
        endpoints: {
          // card: `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/.well-known/${app.appId}.json`,
          card: `${agentHost(req)}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/.well-known/${app.appId}.json`,
          // url: `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/${app.appId}/${A2AProtocolAttributes.MethodInvoke}`,
          url: `${agentHost(req)}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/${app.appId}/${A2AProtocolAttributes.MethodInvoke}`
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

    // Check if AI Application loaded in app context, is active and is enabled to be exposed over A2A
    if (!application || !application.isActive || !application.enableA2AEndpoint) {
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
      // url: `${req.protocol}://${req.srvctx.host}:${req.srvctx.port}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/${application.appId}/${A2AProtocolAttributes.MethodInvoke}`,
      url: `${agentHost(req)}${req.srvctx.endpoint}${GatewayRouterEndpoints.A2AEndpoint}/${application.appId}/${A2AProtocolAttributes.MethodInvoke}`,
      preferredTransport: A2AProtocolAttributes.DefaultTransport,
      provider: {
        organization: Organization,
        url: OrgUrl
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
        tags: ["chat-completion"]
      }],
      // ID10252025.sn
      // If security is turned on for the AI Gateway, include the 'securitySchemes' & 'security' attributes in the agent card
      securitySchemes: (process.env.API_GATEWAY_AUTH) ?
        {
          aadOAuth: {
            type: "oauth2",
            description: "Microsoft Entra ID (Azure AD) using OAuth 2.0 and OpenID Connect.",
            flows: {
              authorizationCode: {
                authorizationUrl: `${securityConfig.metadata.authority}/${securityConfig.credentials.tenantID}/oauth2/v2.0/authorize`,
                tokenUrl: `${securityConfig.metadata.authority}/${securityConfig.credentials.tenantID}/oauth2/v2.0/token`,
                scopes: {
                  openid: "Request an ID token (OIDC).",
                  profile: "Basic profile claims.",
                  offline_access: "Refresh token for long-lived sessions.",
                  [`api://${securityConfig.credentials.clientID}/${permissionsConfig.RouterReadPermission}`]: "Read tasks/messages.",
                  [`api://${securityConfig.credentials.clientID}/${permissionsConfig.RouterWritePermission}`]: "Invoke agents - Create/update tasks/messages."
                }
              },
              clientCredentials: {
                tokenUrl: `${securityConfig.metadata.authority}/${securityConfig.credentials.tenantID}/oauth2/v2.0/token`,
                scopes: {
                  [`api://${securityConfig.credentials.clientID}/.default`]: "Use the application's app roles/scopes (application permissions)."
                }
              }
            },
            // Non-normative hints (helpful for discovery; not required by A2A):
            "x-aad": {
              issuer: `${securityConfig.metadata.authority}/${securityConfig.credentials.tenantID}/${securityConfig.metadata.version}`,
              jwks_uri: `${securityConfig.metadata.authority}/${securityConfig.credentials.tenantID}/discovery/${securityConfig.metadata.version}/keys`
            }
          },
          aadBearer: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Send 'Authorization: Bearer <access_token>' issued by Microsoft Entra ID."
          }
        } : null,
      security: (process.env.API_GATEWAY_AUTH) ?
        [
          { aadOAuth: [`api://${securityConfig.credentials.clientID}/${permissionsConfig.RouterReadPermission}`, `api://${securityConfig.credentials.clientID}/${permissionsConfig.RouterWritePermission}`] },
          { aadBearer: [] }
        ] : null,
      // ID10252025.en
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