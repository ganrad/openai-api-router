/**
 * Name: Agent to Agent (A2A) Protocol Helper Functions
 * Description: This script contains misc. helper functions to support A2A endpoints.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-06-2025
 * Version (Introduced): v2.7.0
 *
 * Notes:
 * ID10182025: ganrad: v2.7.5: (Bugfixes) Includes multiple bug fixes.
 * ID06242026: ganrad: v3.0.1: (Enhancement)  Added support for Anthropic Messages API
 */
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const {
  generateUUID,
  A2AProtocolAttributes,
  A2ATaskStatus,
  A2AObjectKind,
  AzAiServices, // ID06242026.n
  AiGatewayInboundReqApiType // ID06242026.n
} = require("./app-gtwy-constants.js");

const { AiApiError } = require("./helper-classes.js"); // ID06242026.n

// async function mapOpenAIMessagesToA2ATask(requestId, a2aMessage, response) { ID06242026.o
async function mapApiMessagesToA2ATask(requestId, appType, a2aMessage, response) { // ID06242026.n
  const apiMessage = response.data;
  // const responseContent = openaiMessage.choices[0].message.content; ID06242026.o
  const responseContent = (appType === AzAiServices.OAI) ? apiMessage.choices[0].message.content : apiMessage.content[0].text; // ID06242026.n

  // Transform back to A2A format: Create an Artifact
  const artifactId = await generateUUID();
  const artifact = {
    kind: A2AObjectKind.Artifact,
    artifactId,
    parts: [{ kind: A2AProtocolAttributes.MessagePartKindText, text: responseContent }],
    name: 'Application Response',
    description: 'Response from AI App inference pipeline',
    metadata: {
      usage: apiMessage.usage
    }
  };

  // Create Task (synchronous/blocking mode)
  const taskId = await generateUUID();
  const task = {
    id: taskId,
    kind: A2AObjectKind.Task,
    contextId: response.threadId || '', // ThreadID!
    status: {
      state: A2ATaskStatus.Completed, // Set Task Status = Completed
      timestamp: new Date().toISOString(),
      message: {
        role: A2AProtocolAttributes.RoleAgent,
        kind: A2AObjectKind.Message,
        messageId: a2aMessage.messageId || requestId, // Set the message ID
        parts: [
          {
            kind: A2AProtocolAttributes.MessagePartKindText,
            text: "Call completed successfully"
          }
        ]
      }
    },
    history: [a2aMessage], // Include the input message
    artifacts: [artifact],
    metadata: {
      requestId,
      cached: response.cached
    }
  };

  return (task);
}

// async function transformOpenAIToA2AResult(req, response) { ID06242026.o
async function transformMessageToA2AResult(appType, req, response) { // ID06242026.n
  if (response.data.error)
    return (response);

  let a2aResponse = {
    http_code: response.http_code,
    data: {
      jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
      id: req.a2aReqId,
      // result: await mapOpenAIMessagesToA2ATask(req.id, req.a2aMessage, response) // ID06242026.o
      result: await mapApiMessagesToA2ATask(req.id, appType, req.a2aMessage, response) // ID06242026.n
    }
  };

  logger.log({ level: "debug", message: "[%s] transformMessageToA2AResult():\n  Request ID: %s\n  App Type: %s\n  Agent ID: %s\n  Response:\n%s", splat: [scriptName, req.id, appType, req.params.app_id, JSON.stringify(a2aResponse, null, 2)] });

  return (a2aResponse);
}

// Helper 'async-generate' function to parse OpenAI streaming chunks
async function* parseStream(reader) {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          yield parsed;
        }
        catch (e) {
          console.error('Error parsing stream chunk:', e);
        };
      }
    }
  }
  if (buffer && buffer.startsWith('data: ')) {
    const data = buffer.slice(6);
    if (data !== '[DONE]') {
      try {
        yield JSON.parse(data);
      }
      catch (e) {
        console.error('Error parsing final stream chunk:', e);
      };
    }
  }
}

/**
 * Parse one SSE block (Messages API) into { event, data }.
 * A block looks like:
 *   event: content_block_delta
 *   data: {"type":"content_block_delta", ...}
 */
function parseAnthropicMsgsSseBlock(block) {
  let eventName = 'message';
  const dataLines = [];

  for (const line of block.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed || trimmed.startsWith(':')) continue; // comment / keep-alive
    if (trimmed.startsWith('event:')) {
      eventName = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      dataLines.push(trimmed.slice(5).trim());
    }
  }

  if (!dataLines.length) return null;

  const dataStr = dataLines.join('\n');
  if (dataStr === '[DONE]') return { event: eventName, data: { done: true } };

  let data;
  try {
    data = JSON.parse(dataStr);
  }
  catch {
    data = { raw: dataStr };
  };
  return { event: eventName, data };
}

/**
 * Streams Anthropic Messages API. Async-iterates & parses SSE events:
 *   { event: 'content_block_delta', data: {...} }, etc.
 *
 * Usage:
 *   for await (const evt of _streamMessage({...})) { ... }
 *
 * @param {object}   res - Response object of Anthropic client
 * @returns {AsyncGenerator<{event: string, data: object}>}
 */
async function* streamAnthropicMessages(res) {

  if (!res.body) throw new AiApiError('No response body for stream.', AiGatewayInboundReqApiType.Anthropic);

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    // res.body is a WHATWG ReadableStream; async-iterate its chunks.
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });

      // SSE events are delimited by a blank line (\n\n). Handle \r\n too.
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const parsed = parseAnthropicMsgsSseBlock(rawEvent);
        if (parsed) {
          yield parsed;
        };
      };
    };

    // Flush any trailing event without a final blank line.
    const tail = buffer.trim();
    if (tail) {
      const parsed = parseAnthropicMsgsSseBlock(tail);
      if (parsed) {
        yield parsed;
      };
    };
  }
  finally {
    // Close the Express SSE stream when the upstream is done/aborted.
    // if (expressRes && !expressRes.writableEnded) expressRes.end();
    // expressRes will be closed by the apirouter!
  };
}

// Helper to parse Chat Completions / Messages API streaming chunks
// @param cached Is this a cached response
async function streamA2AResponse(a2aRequest, cached) {
  // Create Task
  const taskId = await generateUUID();
  let task = {
    id: taskId,
    kind: A2AObjectKind.Task,
    contextId: a2aRequest.threadId,
    status: {
      state: (cached) ? A2ATaskStatus.Completed : A2ATaskStatus.Submitted,
      timestamp: new Date().toISOString(),
      message: {
        role: A2AProtocolAttributes.RoleAgent,
        kind: A2AObjectKind.Message,
        messageId: a2aRequest.inputMessage.messageId,
        parts: (cached) ? [
          {
            kind: A2AProtocolAttributes.MessagePartKindText,
            text: "Call completed successfully"
          }
        ] : [
          {
            kind: A2AProtocolAttributes.MessagePartKindText,
            text: "Received streaming request ..."
          }
        ]
      }
    },
    history: [a2aRequest.inputMessage], // Input request message
    artifacts: cached ? await (async () => {
      // Create an Artifact for cached completion
      const artifactId = await generateUUID();
      const artifact = {
        kind: A2AObjectKind.Artifact,
        artifactId,
        parts: [{ kind: A2AProtocolAttributes.MessagePartKindText, text: a2aRequest.responsePayload }],
        name: 'Application Response',
        description: 'Response from AI App inference pipeline',
        metadata: {}
      };

      return [artifact];
    })() : [],
    metadata: {
      requestId: a2aRequest.requestId,
      cached
    }
  };

  // Send initial full Task
  // console.log(`++++++++++++++ Step-0: task status=submitted; Message ID=${a2aRequest.a2aReqId} ****************`);
  a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: task })}\n\n`);

  if (cached)
    return;

  const taskUpdate = {
    taskId,
    kind: A2AObjectKind.TaskStatusUpdate,
    contextId: a2aRequest.threadId,
    status: {
      state: A2ATaskStatus.Working,
      timestamp: new Date().toISOString(),
      message: {
        role: A2AProtocolAttributes.RoleAgent,
        kind: A2AObjectKind.Message,
        messageId: a2aRequest.inputMessage.messageId,
        parts: [
          {
            kind: A2AProtocolAttributes.MessagePartKindText,
            text: "Starting to stream events from backend ..."
          }
        ]
      }
    },
    final: false,
    metadata: {
      requestId: a2aRequest.requestId
    }
  };

  // Send task update - Working
  // console.log(`++++++++++++++ Step-1: task status=working ****************`);
  a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: taskUpdate })}\n\n`);

  let recv_data = '';
  let call_data = null;

  let artifactCount = 0;
  const artifactId = await generateUUID();
  const streamError = false; // ID06242026.n
  try {
    if (a2aRequest.oaiReader) { // ID06242026.n Process AOAI Chat Completion API SSE events
      for await (const chunk of parseStream(a2aRequest.oaiReader)) {
        if (!chunk.choices || chunk.choices.length === 0) {
          // console.log("streamA2AResponse(): Skipping this line");

          // Important: For token usage caller has to set: streams = true and stream_options: { include_usage: true }
          if (chunk.usage && call_data)
            call_data.usage = chunk.usage;
        }
        else {
          let delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            recv_data = recv_data.concat(delta);

            const artifactUpdate = {
              taskId,
              kind: A2AObjectKind.TaskArtifactUpdate,
              contextId: a2aRequest.threadId,
              append: (artifactCount) ? true : false,
              artifact: {
                name: `LLM Response Chunk ${++artifactCount}`,
                description: 'Streaming response chunk from LLM inference',
                artifactId,
                parts: [{ kind: A2AProtocolAttributes.MessagePartKindText, text: delta }]
              },
              metadata: {
                requestId: a2aRequest.requestId
              }
            };

            // Set artifact update
            // console.log(`++++++++++++++ Step-2: artifact count=${artifactCount} ****************`);
            a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: artifactUpdate })}\n\n`);

            if (!call_data && (chunk.created > 0))
              call_data = {
                id: chunk.id,
                object: chunk.object,
                created: chunk.created,
                model: chunk.model,
                system_fingerprint: chunk.system_fingerprint
              };
          };
        };
      };
    }
    else if (a2aRequest.anthropicResponse) { // ID06242026.n Process Anthropic Claude Messages API SSE events
      // Normalized usage accumulator.
      const usage = {
        input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
      };

      const mergeUsage = (u) => {
        if (!u) return;
        if (typeof u.input_tokens === 'number') usage.input_tokens = u.input_tokens;
        if (typeof u.cache_read_input_tokens === 'number')
          usage.cache_read_input_tokens = u.cache_read_input_tokens;
        if (typeof u.cache_creation_input_tokens === 'number')
          usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
        // output_tokens is cumulative; later events carry the latest total.
        if (typeof u.output_tokens === 'number') usage.output_tokens = u.output_tokens;
      };

      for await (const { event, data } of streamAnthropicMessages(response)) {
        switch (event) {
          case 'message_start': // CHECK
            if ( !call_data && data.message )
              call_data = data.message;

            // Initial usage: input + cache counts (output is typically 1 here).
            mergeUsage(data.message?.usage);
            break;
          case 'content_block_delta':
            if (data?.delta?.type === 'text_delta' && data.delta.text) {

              // Write content to A2A event stream
              recv_data += data.delta.text;

              const artifactUpdate = {
                taskId,
                kind: A2AObjectKind.TaskArtifactUpdate,
                contextId: a2aRequest.threadId,
                append: (artifactCount) ? true : false,
                artifact: {
                  name: `LLM Response Chunk ${++artifactCount}`,
                  description: 'Streaming response chunk from LLM inference',
                  artifactId,
                  parts: [{ kind: A2AProtocolAttributes.MessagePartKindText, text: data.delta.text }]
                },
                metadata: {
                  requestId: a2aRequest.requestId
                }
              };

              // Set artifact update
              // console.log(`++++++++++++++ Step-2: artifact count=${artifactCount} ****************`);
              a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: artifactUpdate })}\n\n`);
            };

            break;
          case 'message_delta':
            // Carries the cumulative output_tokens (and sometimes refreshed input).
            mergeUsage(data.usage);
            // Final stop fields arrive here, not in message_start.
            if ( call_data ) {
              if (data.delta?.stop_reason !== undefined) call_data.stopReason = data.delta.stop_reason;
              if (data.delta?.stop_sequence !== undefined) call_data.stopSequence = data.delta.stop_sequence;
            };

            break;
          case 'error':
            throw new AiApiError(
              data?.error?.message || 'Stream error',
              AiGatewayInboundReqApiType.Anthropic,
              { type: data?.error?.type, body: data }
            );
          default:
            break; // content_block_start/stop, message_stop, ping, etc.
        };
      };

      if ( call_data && usage )
        call_data.usage = usage;
    };
  }
  catch (error) {
    streamError = true;
  };

  // Finalize Task and mark as completed
  // console.log(`++++++++++++++ Step-3: final task update ****************`);
  const taskFinalUpdate = {
    taskId,
    kind: A2AObjectKind.TaskStatusUpdate,
    contextId: a2aRequest.threadId,
    status: {
      state: A2ATaskStatus.Completed,
      timestamp: new Date().toISOString(),
      message: {
        role: A2AProtocolAttributes.RoleAgent,
        kind: A2AObjectKind.Message,
        messageId: a2aRequest.inputMessage.messageId,
        parts: [
          {
            kind: A2AProtocolAttributes.MessagePartKindText,
            text: (streamError) ? "Streaming call failed!" : "Streaming call completed successfully"
          }
        ]
      }
    },
    final: true,
    metadata: {
      requestId: a2aRequest.requestId
    }
  };
  if (call_data)
    taskFinalUpdate.metadata.usage = call_data.usage;
  a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: taskFinalUpdate })}\n\n`);

  return {
    recv_data,
    call_data
  };
}

module.exports = {
  // transformOpenAIToA2AResult, ID06242026.o
  transformMessageToA2AResult, // ID06242026.n
  streamA2AResponse
}