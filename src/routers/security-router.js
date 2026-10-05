/**
 * Name: AI Application Gateway Security Policy Router
 * Description: A security router that intercepts all inbound calls and enforces IP security policies/rules.
 * This router only enforces IP inbound rules/policies at the AI Gateway level!
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-28-2026
 * Version: 3.0.1
 *
 * Notes:
*/

const path = require('path');
const scriptName = path.basename(__filename);

const express = require("express");
const { GatewayRouterEndpoints } = require("../utilities/app-gtwy-constants.js");
const logger = require("../utilities/logger.js");
const { formatException } = require("../utilities/helper-funcs.js");
const SecurityEngine = require("../security/security-engine.js");
const secrouter = express.Router();

// Endpoint: /aigateway/*
// Method(s): GET, POST, PUT, DELETE
secrouter.use((req, res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress;

  // Check AI App security policies
  let secEngine = null;
  if ( req.srvconf.securityPolicyConfig ) { 
    secEngine = new SecurityEngine(req.srvconf.securityPolicyConfig);

    // Check -> AI Gateway inbound IP rules
    const clientIp = req.ip || req.socket.remoteAddress;
    const access = secEngine.isInboundAllowed(clientIp);

    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    logger.log({ level: "debug", message: "[%s] secrouter():\n  Request ID: %s\n  Client IP: %s\n  Request URL: %s\n  Access: %s", splat: [scriptName, req.id, clientIp, fullUrl, (access ? "Granted" : "Denied")] });

    if ( !access ) 
      return res.status(403).json({error: `Access Denied. Unauthorized source IP: ${clientIp}`}); // 403 = Forbidden
  };

  next();
});

module.exports = secrouter;