/**
 * MCP server with OAuth (Protected Resource Metadata + token validation)
 * and streaming (SSE) tool invocation support.
 *
 * Description:
 *  - This example expects an external Authorization Server (AS) to issue tokens.
 *  - The server exposes a Protected Resource Metadata endpoint (RFC9728-like)
 *    which points clients to the AS (jwks_uri / introspection).
 *  - Token validation prefers JWKS (RS256) verification; falls back to introspection.
 */

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import jwksRsa from "jwks-rsa";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ---- Configuration ----
// In production, move these to env vars or a config file.
const SERVER_AUDIENCE = process.env.MCP_AUD || "urn:mcp:test-mcp-server";
const PORT = process.env.PORT || 3333;

// Example protected resource metadata (RFC9728-like), advertised to clients.
// Clients use this to discover the authorization server (jwks, introspection, etc).
// Populate the 'authorization_servers' fields with your real AS endpoints.
const PROTECTED_RESOURCE_METADATA = {
  // This endpoint itself is the resource metadata.
  // 'authorization_servers' is an MCP requirement per spec.

  authorization_servers: [
    {
      issuer: "https://auth.example.com",        // the AS issuer
      jwks_uri: "https://auth.example.com/.well-known/jwks.json",
      introspection_endpoint: "https://auth.example.com/oauth2/introspect",
      token_endpoint: "https://auth.example.com/oauth2/token",
      // indicate what token formats are supported, scopes, etc. (optional)
      description: "Example Authorization Server (replace with real AS info)"
    }
  ],

  // Optional: policies, CORS hints, etc.
  version: "1.0"
};

// ---- In-memory tool registry ----
const tools = new Map();
tools.set("echo", {
  name: "echo",
  title: "Echo",
  description: "Return text back",
  input_schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false
  },
  output_schema: { type: "object", properties: { echoed: { type: "string" } }, required: ["echoed"] },
  async invoke(input) {
    return { result: { echoed: input.text }, metadata: { length: input.text.length } };
  },
  streaming: false
});

// streaming tool: emits numbers 1..n with interval (demo only)
tools.set("counter_stream", {
  name: "counter_stream",
  title: "Counter Stream",
  description: "Streams numbers from 1..n at ~300ms interval. Use for demo of SSE.",
  input_schema: {
    type: "object",
    properties: {
      count: { type: "integer", minimum: 1, maximum: 1000 },
      interval_ms: { type: "integer", minimum: 10, maximum: 5000 }
    },
    required: ["count"],
    additionalProperties: false
  },
  output_schema: { type: "object", properties: { final: { type: "number" } }, required: ["final"] },
  async invoke(input) {
    return { result: (Math.random() * (10 - input.count + 1)) + 1, metadata: { time: Date.now()} };
  },
  streaming: true, // indicates this tool can stream
  // streamHandler receives (input, sse) where sse is an object with send(data) and close()
  async streamHandler(input, sse) {
    const interval = input.interval_ms ?? 300;
    for (let i = 1; i <= input.count; ++i) {
      // If client closed connection, break
      if (sse.closed) break;
      sse.send({ value: i, index: i - 1 });

      // small delay
      await new Promise((r) => setTimeout(r, interval));
    }

    if (!sse.closed) {
      sse.send({ final: Math.min(input.count, 100000) });
      sse.done();
    }
  }
});

// ---- Utility helpers ----
function discoveryList() {
  return [...tools.values()].map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    input_schema: t.input_schema,
    output_schema: t.output_schema,
    streaming: !!t.streaming
  }));
}

// ---- OAuth resource metadata endpoint (Protected Resource Metadata) ----
// Clients will fetch this to discover authorization server locations, jwks, introspection.
app.get("/.well-known/mcp-resource", (req, res) => {
  res.json(PROTECTED_RESOURCE_METADATA);
});

// JWKS client cache factories (one per authorization server entry)
const jwksClients = new Map();
function getJwksClient(jwksUri) {
  if (jwksClients.has(jwksUri)) return jwksClients.get(jwksUri);

  const client = jwksRsa({
    jwksUri: jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 3600000 // 1 hour
  });

  jwksClients.set(jwksUri, client);
  return client;
}

// Token validation middleware
async function validateAccessToken(req, res, next) {
  try {
    const auth = req.get("authorization") || "";
    const match = auth.match(/^Bearer (.+)$/i);

    if (!match) {
      return res.status(401).json({ error: "invalid_request", error_description: "Missing Authorization Bearer token" });
    }

    const token = match[1];
    // Choose a configured authorization server (first one in metadata)
    const as = PROTECTED_RESOURCE_METADATA.authorization_servers?.[0];
    if (!as) {
      return res.status(500).json({ error: "server_error", error_description: "No authorization server configured on MCP resource metadata" });
    }

    // Try JWKS-based verification first (RS256/JWK)
    if (as.jwks_uri) {
      try {
        const client = getJwksClient(as.jwks_uri);

        // getKey function for jwks-rsa + jsonwebtoken
        const getKey = (header, callback) => {
          client.getSigningKey(header.kid).then((key) => {
            const signingKey = key.getPublicKey();

            callback(null, signingKey);
          }).catch((err) => {
            callback(err);
          });
        };

        // verify token (promisify)
        const verifyAsync = () =>
          new Promise((resolve, reject) => {
            jwt.verify(token, getKey, { audience: SERVER_AUDIENCE }, (err, decoded) => {
              if (err) return reject(err);
              resolve(decoded);
            });
          });

        const decoded = await verifyAsync();
        // Attach token claims and continue
        req.token = decoded;

        return next();
      }
      catch (jwksErr) {
        // proceed to introspection fallback if configured
        console.warn("JWKS verification failed (trying introspection if available):", jwksErr?.message || jwksErr);
      }
    }

    // Fallback: token introspection
    if (as.introspection_endpoint) {
      try {
        // NOTE: introspection requires client credentials. For demo we assume introspection endpoint

        // allows unauthenticated calls OR you would configure client_id/secret here to call.
        const introspectResp = await fetch(as.introspection_endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }).toString()
          // If your introspection endpoint requires Basic auth:
          // headers: { Authorization: 'Basic ' + base64(clientId + ':' + clientSecret) }
        });

        if (!introspectResp.ok) {
          throw new Error(`Introspection responded ${introspectResp.status}`);
        }

        const introspect = await introspectResp.json();
        if (!introspect.active) {
          return res.status(401).json({ error: "invalid_token", error_description: "Token is inactive" });
        }

        // Check audience claim if present (introspection returns 'aud' or 'client_id' etc)
        if (introspect.aud && introspect.aud !== SERVER_AUDIENCE) {
          return res.status(403).json({ error: "insufficient_scope", error_description: "Token audience mismatch" });
        }

        req.token = introspect; // attach claims

        return next();
      }
      catch (intErr) {
        console.error("Introspection error:", intErr);
        return res.status(401).json({ error: "invalid_token", error_description: "Token verification failed" });
      }
    }

    // No method could validate token
    return res.status(401).json({ error: "invalid_token", error_description: "Unable to validate token (no jwks or introspection configured)" });
  } catch (err) {
    console.error("Unexpected token validation error:", err);
    return res.status(500).json({ error: "server_error", error_description: "Token validation failed" });
  }
}

// ---- Health check ----
// GET /
app.get("/", (req, res) => res.json({ ok: true, server: "mcp-oauth-stream-test-server", version: "1.1" }));

// ---- Discovery ----
// GET /tools/list
app.get("/tools/list", (req, res) => {
  res.json({ tools: discoveryList() });
});

// ---- Get tool details ----
// GET /tools/{toolName}
app.get("/tools/:name", (req, res) => {
  const t = tools.get(req.params.name);

  if (!t) return res.status(404).json({ status: "error", error: { type: "not_found", message: "Tool not found." } });

  res.json({ tool: { name: t.name, title: t.title, description: t.description, input_schema: t.input_schema, output_schema: t.output_schema, streaming: !!t.streaming } });
});

// ---- SSE helper ----
function sseSetup(req, res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  // flush headers
  res.flushHeaders?.();
  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  return {
    send(obj) {
      if (closed) return;
      const data = JSON.stringify(obj);
      res.write(`data: ${data}\n\n`);
    },
    done() {
      if (closed) return;
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
      closed = true;
    },
    error(errObj) {
      if (closed) return;
      const data = JSON.stringify(errObj);
      res.write(`event: error\ndata: ${data}\n\n`);
      res.end();
      closed = true;
    },
    get closed() {
      return closed;
    }
  };
}

// ---- Invocation endpoint (supports streaming) ----
// POST /tools/call
// body: { tool: "name", input: {...} }
// auth: Bearer token (validated by validateAccessToken)
// app.post("/tools/call", validateAccessToken, async (req, res) => {
app.post("/tools/call", async (req, res) => {
  try {
    const { tool: toolName, input } = req.body ?? {};
    if (!toolName || typeof toolName !== "string") {
      return res.status(400).json({ status: "error", error: { type: "bad_request", message: "Missing or invalid 'tool' field." } });
    }

    const tool = tools.get(toolName);
    if (!tool) {
      return res.status(404).json({ status: "error", error: { type: "not_found", message: `Tool '${toolName}' not found.` } });
    }

    // Validate input
    const validate = ajv.compile(tool.input_schema || { type: "object" });
    const valid = validate(input);
    if (!valid) {
      return res.status(400).json({
        status: "error",
        error: { type: "validation", message: "Input did not validate against tool schema.", details: validate.errors }
      });
    }

    // Decide streaming mode:
    const wantStream = (req.query.stream === "true") || (req.get("accept")?.includes("text/event-stream"));
    if (wantStream && tool.streaming && typeof tool.streamHandler === "function") {
      // Upgrade to SSE
      const sse = sseSetup(req, res);
      try {
        // Optionally include token claims to tool (if tool requires identity)
        const tokenClaims = req.token || {};

        await tool.streamHandler({ ...input, _token: tokenClaims }, sse);

        if (!sse.closed) sse.done();
      } catch (streamErr) {
        console.error("Streaming invocation error:", streamErr);
        if (!sse.closed) sse.error({ message: "Tool streaming failed", details: String(streamErr) });
      }
      return;
    }

    // Non-streaming invocation
    try {
      const invocationResult = await tool.invoke(input);
      return res.json({
        status: "ok",
        tool: toolName,
        result: invocationResult?.result ?? null,
        metadata: invocationResult?.metadata ?? null
      });
    } 
    catch (invokeErr) {
      console.error("Tool invocation error", invokeErr);

      return res.status(500).json({
        status: "error",
        error: { type: "execution", message: "Tool execution failed.", details: String(invokeErr) }
      });
    }
  } catch (err) {
    console.error("Unexpected error in /tools/call", err);
    return res.status(500).json({ status: "error", error: { type: "execution", message: "Unexpected server error.", details: String(err) } });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`MCP OAuth+Stream server listening on http://localhost:${PORT}`);
  console.log(`Protected Resource Metadata at http://localhost:${PORT}/.well-known/mcp-resource`);
});