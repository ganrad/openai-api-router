/**
 * Name: MCP client class
 * Description: This class provides functions to send requests to MCP servers and handle responses, including streaming SSE responses.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 03-03-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 */

const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');
const {
  HttpHeaders,
  HttpMethods,
  MimeTypes,
  A2AProtocolAttributes,
  McpMethods
} = require("./app-gtwy-constants.js");

class McpHttpError extends Error {
  constructor(message, status, statusText, bodyText) {
    super(message);
    this.name = "McpHttpError";
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

class McpProtocolError extends Error {
  constructor(message, payload) {
    super(message);
    this.name = "McpProtocolError";
    this.payload = payload;
  }
}


let _id = 0;
function nextRpcId() { _id += 1; return _id; }

function getContentType(res) {
  return (res.headers.get("content-type") || "").toLowerCase();
}

function isJsonContentType(ct) {
  return ct.includes("application/json") || ct.includes("+json");
}

function isSseContentType(ct) {
  return ct.includes("text/event-stream");
}

async function readTextSafe(res) {
  try { return await res.text(); } catch { return undefined; };
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } 
  catch (e) {
    return { ok: false, error: e };
  };
}

/**
 * Parse an SSE frame (string) into an object: { event?, id?, retry?, data }
 * Supports multi-line "data:" fields per SSE rules.
 */
function parseSseFrame(rawFrame) {
  const lines = rawFrame.split(/\r?\n/);

  let event;
  let id;
  let retry;
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue; // empty/comment

    const idx = line.indexOf(":");
    const field = (idx === -1 ? line : line.slice(0, idx)).trim();
    const value = idx === -1 ? "" : line.slice(idx + 1).trimStart();

    switch (field) {
      case "event":
        event = value;
        break;
      case "id":
        id = value;
        break;
      case "retry": {
        const n = Number(value);
        if (Number.isFinite(n)) retry = n;
        break;
      }
      case "data":
        dataLines.push(value);
        break;
      default:
        // ignore unknown fields
        break;
    }
  }

  if (dataLines.length === 0) return null;
  return { event, id, retry, data: dataLines.join("\n") };
}

/**
 * Async generator that yields SSE events from a WHATWG ReadableStream (Response.body)
 * Handles both \n\n and \r\n\r\n as frame separators.
 */
async function* parseSseStream(bodyStream) {
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read(); // fetch-stream pattern [2](https://stackoverflow.com/questions/62121310/how-to-handle-streaming-data-using-fetch)
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const lf = buffer.indexOf("\n\n");
        const crlf = buffer.indexOf("\r\n\r\n");
        const frameEnd =
          lf === -1 ? crlf : crlf === -1 ? lf : Math.min(lf, crlf);

        if (frameEnd === -1) break;

        const rawFrame = buffer.slice(0, frameEnd);
        const sepLen = buffer.startsWith("\r\n\r\n", frameEnd) ? 4 : 2;
        buffer = buffer.slice(frameEnd + sepLen);

        const evt = parseSseFrame(rawFrame);
        if (evt) yield evt;
      };
    };

    // flush tail if any
    const tail = buffer.trim();
    if (tail) {
      const evt = parseSseFrame(tail);
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Send one MCP JSON-RPC request to a Streamable HTTP MCP endpoint.
 * Supports:
 * - JSON response (application/json)
 * - Streamed SSE response (text/event-stream) on the POST call
 */
async function sendMcpRequest(endpointUrl, rpcRequest, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const extraHeaders = options.headers ?? {};
  const collectStreamMessages = !!options.collectStreamMessages;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // MCP Streamable HTTP: client must accept both JSON + SSE [1](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
  const headers = {
    [HttpHeaders.ContentType]: MimeTypes.Json,
    [HttpHeaders.Accept]: `${MimeTypes.Json}, ${MimeTypes.EventStream}`,
    ...extraHeaders,
  };

  console.log("******** Sending MCP request to endpoint:", endpointUrl, "Request object:", JSON.stringify(rpcRequest), "Headers:", headers); // Debug log to check the request being sent

  let res;
  try {
    res = await fetch(endpointUrl, {
      method: HttpMethods.POST,
      headers,
      body: JSON.stringify(rpcRequest),
      signal: controller.signal,
    });
  } 
  catch (e) {
    clearTimeout(timeout);
    throw new McpHttpError(
      "Network error calling MCP endpoint",
      0,
      "NETWORK_ERROR",
      e?.message
    );
  }

  const ct = getContentType(res);

  if (!res.ok) {
    const bodyText = await readTextSafe(res);
    clearTimeout(timeout);
    throw new McpHttpError(
      `MCP endpoint returned HTTP ${res.status} ${res.statusText}`,
      res.status,
      res.statusText,
      bodyText
    );
  }

  // JSON response
  if (isJsonContentType(ct)) {
    const json = await res.json();
    clearTimeout(timeout);

    if (json?.error) {
      throw new McpProtocolError(
        `MCP JSON-RPC error ${json.error.code}: ${json.error.message}`,
        json
      );
    }
    if (json?.id !== rpcRequest.id) {
      throw new McpProtocolError(
        `MCP JSON-RPC response id mismatch (expected ${rpcRequest.id}, got ${json?.id})`,
        json
      );
    }
    return { response: json };
  }

  // SSE response streamed on POST
  if (isSseContentType(ct)) {
    if (!res.body) {
      clearTimeout(timeout);
      throw new McpHttpError("SSE response had no body stream", res.status, res.statusText);
    };

    const streamedMessages = [];
    let finalResponse = null;

    try {
      for await (const evt of parseSseStream(res.body)) {
        const parsed = safeJsonParse(evt.data);
        if (!parsed.ok) {
          // Non-JSON SSE data; ignore or log if you want
          continue;
        };

        const msg = parsed.value;
        if (collectStreamMessages) 
          streamedMessages.push(msg);

        // Return the response matching our JSON-RPC id
        if (msg && msg.id === rpcRequest.id) {
          finalResponse = msg;
          break;
        };
      };
    } 
    finally {
      clearTimeout(timeout);
      // Once we got our answer, abort the request to stop reading further.
      // (If server closes naturally, abort is harmless.)
      try { controller.abort(); } catch { }
    };

    if (!finalResponse) {
      throw new McpProtocolError(
        `SSE stream ended without a JSON-RPC response for id=${rpcRequest.id}`
      );
    };

    if (finalResponse.error) {
      throw new McpProtocolError(
        `MCP JSON-RPC error ${finalResponse.error.code}: ${finalResponse.error.message}`,
        finalResponse
      );
    };

    return collectStreamMessages
      ? { response: finalResponse, streamedMessages }
      : { response: finalResponse };
  }

  // Unknown content-type
  const bodyText = await readTextSafe(res);
  clearTimeout(timeout);
  throw new McpHttpError(
    `Unsupported Content-Type from MCP endpoint: ${ct || "(none)"}`,
    res.status,
    res.statusText,
    bodyText
  );
}

/**
 * Call an MCP Server tool endpoint.
 * @param {Object} mcpServer - The MCP Server object containing id, uri, auth info, etc.
 * - endpointUrl: The full URL of the MCP Server endpoint to call.
 * - rpcId: A unique ID for the JSON-RPC request.
 * - jsonrpc: (optional) The JSON-RPC version string, defaulting to "2.0".
 * - method: (optional) The MCP method name to call, defaulting to "tools.list".
 * - headers: An object of additional HTTP headers to include in the request.
 * - params: An object of parameters to include in the JSON-RPC request.
 * @returns {Object} The parsed JSON result from the MCP Server tool.
 * @throws {McpHttpError} If there was a network error or non-2xx HTTP response.
 * @throws {McpProtocolError} If the response was not valid JSON-RPC or contained an error.
 * 
 */
async function getMcpServerResponse({
  endpointUrl,
  rpcId = nextRpcId(),
  jsonrpc = A2AProtocolAttributes.JsonRpcVersion,
  method = McpMethods.TOOLS_LIST,
  headers = {},
  params = {}
}) {
  const rpcRequest = {
    jsonrpc,
    id: rpcId,
    method,
    params
  };

  const { response } = await sendMcpRequest(endpointUrl, rpcRequest, {
    timeoutMs: 30_000,
    headers
  });

  // Normalize tools list: servers vary between {result:{tools:[...]}} and {result:[...]}
  // const toolsList = (response.result && response.result.tools) || response.result || [];
  // return toolsList;

  return response;
}

module.exports = {
  getMcpServerResponse
};