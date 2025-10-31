/**
 * Name: AI Application Gateway/Router Auth bootstrap module
 * Description: This module contains functions for authenticating users/client apps to AI Gateway using OAuth + PKCE code flow. 
 * This module uses 'jwt-rsa' and 'jsonwebtoken' libraries and as such removes dependency on the older and deprecated 'passport' & 
 * 'passport-azure-ad' libraries.  Access to gateway resources are now controlled using JWT scopes.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-25-2025
 * Version (Introduced): 2.8.5
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

const { permissionsConfig, securityConfig } = require('./securityConfig');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const {
  AiGatewayInboundReqApiType,
  A2AProtocolAttributes,
  GatewayRouterEndpoints,
  HttpMethods } = require('../utilities/app-gtwy-constants');

/**
 * Configure these for your tenant & API:
 * - TenantId: Your Entra tenant ID (GUID) or domain (GUID recommended).
 * - Audience: AI Gateway's App ID URI (e.g., api://<appIdGuid>) or the client ID GUID.
 * - Issuer:   Must match the token's iss claim (v2.0).
 */
const TenantId = securityConfig.credentials.tenantID; // e.g., "11111111-2222-3333-4444-555555555555"
const Issuer = `${securityConfig.metadata.authority}/${TenantId}/${securityConfig.metadata.version}`; // v2.0 issuer
const Audience = securityConfig.credentials.clientID; // e.g., "api://aaaa-bbbb-cccc-dddd-eeee" or GUID

// Discover JWKS via tenant's OIDC metadata.
// OIDC metadata URI => https://login.microsoftonline.com/${TenantId}/v2.0/.well-known/openid-configuration
// In practice you can hardcode the jwks_uri format from metadata.
const JWKS_URI = `${securityConfig.metadata.authority}/${TenantId}/discovery/v2.0/keys`;

 // Adjust values passed to the jwks client as needed below.
const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true, // Caching of tokens is enabled by default
  cacheMaxEntries: 10,
  cacheMaxAge: 5 * 60 * 1000, // 5 minutes
  rateLimit: true, // Adjust rate limit and RPM's as desired
  jwksRequestsPerMinute: 50
});

function isAuthCheckRequiredForUri(req) {
  if (req.path === GatewayRouterEndpoints.HealthEndpoint) // No auth check required for '/healthz' endpoint
    return false;

  // No auth check required for 1) '/agents/.well-known/agents.json 2) '/agents/.well-known/{agent}-card.json
  if ( req.path.includes(GatewayRouterEndpoints.A2AEndpoint) && (req.method === HttpMethods.GET) )
    return false;

  return true;
}

function getKey(header, callback) {
  // header.kid tells us which signing key to use
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    // jwks-rsa v3+: key.getPublicKey(); older: key.publicKey || key.rsaPublicKey
    const signingKey = key.getPublicKey ? key.getPublicKey() : (key.publicKey || key.rsaPublicKey);
    callback(null, signingKey);
  });
}

function checkResourceAuthorization(req, uid, permsArray) {
  let allowed = false;

  const parts = req.path.split('/');
  const slicedParts = parts.slice(0, 2);
  const ctxPath = slicedParts.join('/');

  switch (ctxPath) {
    case GatewayRouterEndpoints.A2AEndpoint:
    case GatewayRouterEndpoints.InferenceEndpoint:
      allowed = permsArray.includes(permissionsConfig.RouterWritePermission);
      break;
    case GatewayRouterEndpoints.InstanceInfoEndpoint:
    case GatewayRouterEndpoints.MetricsEndpoint:
    case GatewayRouterEndpoints.RequestsEndpoint:
    case GatewayRouterEndpoints.SessionsEndpoint:
      allowed = permsArray.includes(permissionsConfig.RouterWritePermission) || permsArray.includes(permissionsConfig.RouterReadPermission);
      break;
    case GatewayRouterEndpoints.ReconfigureEndpoint:
    case GatewayRouterEndpoints.ControlPlaneEndpoint:
      if (req.method === HttpMethods.GET)
        allowed = permsArray.includes(permissionsConfig.RouterReadPermission);
      else // POST, PUT, DELETE
        allowed = permsArray.includes(permissionsConfig.ControlPlaneWritePermission);
      break;
  };

  logger.log({ level: "info", message: "[%s] checkResourceAuthorization():\n  Request ID: %s\n  User: %s\n  Context Path: %s\n  Permissions: %s\n  Allowed: %s", splat: [scriptName, req.id, uid, ctxPath, JSON.stringify(permsArray, null, 2), allowed ? "Yes" : "No"] });
  return (allowed);
}

/**
 * Optionally enforce required scopes or roles.
 * For v2 access tokens, user consented scopes are in `scp` (space-delimited).
 * App roles (application permissions) show in `roles` array.
 */
function hasAnyRequiredPermission(req, decoded, { requiredScopes = [], requiredRoles = [] } = {}) {
  // Scopes (delegated permissions)
  let scp = []; // init empty array
  if (requiredScopes.length) {
    scp = (decoded.scp || '').split(' ').filter(Boolean);
    if (!requiredScopes.some(s => scp.includes(s))) return false;
  };

  // Roles (application permissions)
  let roles = []; // init empty array
  if (requiredRoles.length) {
    roles = decoded.roles || [];
    if (!requiredRoles.some(r => roles.includes(r))) return false;
  };

  return ((scp.length > 0 || roles.length > 0) && checkResourceAuthorization(req, decoded.name, scp.length ? scp : roles));
}

/**
 * Express middleware factory
 */
function validateAccessToken(endpoint, options = {}) {
  const {
    audience = Audience,
    issuer = Issuer,
    algorithms = ['RS256'],
    requiredScopes = [],
    requiredRoles = [],
  } = options;

  const logSecConfig = {
    endpoint,
    audience,
    issuer,
    algorithms,
    requiredScopes,
    requiredRoles
  };
  logger.log({ level: "info", message: "[%s] validateAccessToken(): AI Gateway Security Configuration:\n%s", splat: [scriptName, JSON.stringify(logSecConfig, null, 2)] });

  return function (req, res, next) { // Authenticate/Authorize API call
    logger.log({
      level: "info", message: "[%s] checkAuth():\n  Request ID: %s\n  Method: %s\n  URL: %s\n  Base URL: %s\n  Path: %s",
      splat: [scriptName, req.id, req.method, req.originalUrl, req.baseUrl, req.path]
    });

    if (!isAuthCheckRequiredForUri(req))
      return next();

    const auth = req.headers.authorization || '';
    const [scheme, token] = auth.split(' ');

    const inboundApiType =
      req.originalUrl.includes(GatewayRouterEndpoints.A2AEndpoint) ? AiGatewayInboundReqApiType.Agent2Agent : AiGatewayInboundReqApiType.OpenAI;
    const a2aReqId = req.body.id;

    if (scheme !== 'Bearer' || !token) {
      const errObj = (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? {
        error: {
          target: req.originalUrl,
          message: 'Missing or invalid Authorization header',
          code: "unauthorized"
        }
      } : {
        jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
        id: a2aReqId,
        error: { code: -32001, message: 'Missing or invalid Authorization header' }
      };

      return res.status(401).json(errObj);
    };

    jwt.verify( // Checks audience and issuer
      token,
      getKey,
      {
        algorithms,
        audience,
        issuer,
        clockTolerance: 60, // seconds, to handle small clock skews
      },
      (err, decoded) => {
        if (err) {
          const errObj = (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? {
            error: {
              target: req.originalUrl,
              message: `Invalid token. Error message: ${err.message}`,
              code: "unauthorized"
            }
          } : {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: a2aReqId,
            error: { code: -32001, message: `Invalid token. Error message: ${err.message}` }
          };

          // Common issues: wrong aud (Graph token), wrong issuer (using /common instead of tenant), expired token, wrong alg
          return res.status(401).json(errObj);
        };

        // Permission checks
        if (!hasAnyRequiredPermission(req, decoded, { requiredScopes, requiredRoles })) {
          const errObj = (inboundApiType === AiGatewayInboundReqApiType.OpenAI) ? {
            error: {
              target: req.originalUrl,
              message: 'Insufficient permissions',
              code: "unauthorized"
            }
          } : {
            jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
            id: a2aReqId,
            error: { code: -32001, message: 'Insufficient permissions' }
          };

          return res.status(403).json(errObj);
        };

        // Attach identity info for downstream handlers
        req.authInfo = { token: decoded, raw: token };
        // logger.log({ level: "debug", message: "[%s] checkAuth():\n  Request ID: %s\n  Auth. Info:\n%s", splat: [scriptName, req.id, JSON.stringify(req.authInfo, null, 2)] });
        next();
      }
    );
  };
}

module.exports = { validateAccessToken };