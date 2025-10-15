/**
 * Name: Agent to Agent (A2A) Protocol Helper Functions
 * Description: This script contains misc. helper functions to support A2A endpoints.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 10-06-2025
 * Version (Introduced): v2.7.0
 *
 * Notes:
 */
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const {
  generateUUID,
  A2AProtocolAttributes,
  A2ATaskStatus,
  A2AObjectKind
} = require("./app-gtwy-constants.js");

async function mapOpenAIMessagesToA2ATask(requestId, a2aParams, response) {
  const openaiMessage = response.data;
  const responseContent = openaiMessage.choices[0].message.content;

  // Transform back to A2A format: Create an Artifact
  const artifactId = await generateUUID();
  const artifact = {
    kind: A2AObjectKind.Artifact,
    artifactId,
    parts: [{ kind: A2AProtocolAttributes.MessagePartKindText, text: responseContent }],
    name: 'Application Response',
    description: 'Response from AI App inference pipeline',
    metadata: {
      usage: openaiMessage.usage
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
      message: 'Call completed successfully'
    },
    history: [a2aParams], // Include the input message
    artifacts: [artifact],
    metadata: {
      requestId,
      cached: response.cached
    }
  };

  return (task);
}

async function transformOpenAIToA2AResult(req, inpA2aParams, response) {
  if (response.data.error)
    return (response);

  let a2aResponse = {
    http_code: response.http_code,
    data: {
      jsonrpc: A2AProtocolAttributes.JsonRpcVersion,
      id: req.a2aReqId,
      result: await mapOpenAIMessagesToA2ATask(req.id, inpA2aParams, response)
    }
  };

  logger.log({ level: "debug", message: "[%s] transformOpenAIToA2AResult():\n  Request ID: %s\n  Agent ID: %s\n  Response:\n%s", splat: [scriptName, req.id, req.params.app_id, JSON.stringify(a2aResponse, null, 2)] });

  return (a2aResponse);
}

// Helper to parse OpenAI streaming chunks
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
        } catch (e) {
          console.error('Error parsing stream chunk:', e);
        }
      }
    }
  }
  if (buffer && buffer.startsWith('data: ')) {
    const data = buffer.slice(6);
    if (data !== '[DONE]') {
      try {
        yield JSON.parse(data);
      } catch (e) {
        console.error('Error parsing final stream chunk:', e);
      }
    }
  }
}

async function streamA2AResponse(a2aRequest, cached) {
  // Create Task
  const taskId = await generateUUID();
  let task = {
    id: taskId,
    kind: A2AObjectKind.Task,
    contextId: a2aRequest.threadId,
    status: {
      state: (cached) ? A2ATaskStatus.Completed : A2ATaskStatus.Submitted,
      timestamp: new Date().toISOString()
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
  a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: task })}\n\n`);

  if ( cached )
    return;

  let recv_data = '';
  let call_data = null;

  const taskUpdate = {
    taskId,
    kind: A2AObjectKind.StatusUpdate,
    contextId: a2aRequest.threadId,
    status: { state: A2ATaskStatus.Running, timestamp: new Date().toISOString() },
    metadata: {
      requestId: a2aRequest.requestId
    }
  };

  // Send task update - Running
  a2aRequest.responseStream.write(`data: ${JSON.stringify({ jsonrpc: A2AProtocolAttributes.JsonRpcVersion, id: a2aRequest.a2aReqId, result: taskUpdate })}\n\n`);

  let artifactCount = 0;
  const artifactId = await generateUUID();
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
          kind: A2AObjectKind.ArtifactUpdate,
          contextId: a2aRequest.threadId,
          artifact: {
            name: `LLM Response Chunk ${++artifactCount}`,
            description: 'Streaming response chunk from LLM inference',
            artifactId,
            parts: [{ kind: A2AProtocolAttributes.MessagePartKindText, text: delta }]
          },
          append: true
        };

        // Set artifact update
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
  }

  // Finalize Task and mark as completed
  const taskFinalUpdate = {
    taskId,
    kind: A2AObjectKind.StatusUpdate,
    contextId: a2aRequest.threadId,
    status: { state: A2ATaskStatus.Completed, timestamp: new Date().toISOString() },
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
  }
}

module.exports = {
  transformOpenAIToA2AResult,
  streamA2AResponse
}