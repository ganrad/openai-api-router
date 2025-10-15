/**
 * Name: streaming-client.ts
 * Description: Sample streaming A2A client
 * Date: 10-10-2025
 * Version (Introduced): 2.7.0
 * 
 */
import { A2AClient } from "@a2a-js/sdk/client";
import { DataPart, FilePart, MessageSendParams, TextPart } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";
// ... other imports ...

async function main() {
  // Create a client pointing to the agent's Agent Card URL.
  // Agent Registry URI: http://{API_GATEWAY_HOST}:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/aigateway/agents/.well-known/agents.json 
  // Agent URI: http://{API_GATEWAY_HOST}:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/aigateway/agents/.well-known/{AI_APPLICATION_ID}.json
  const client = await A2AClient.fromCardUrl("http://localhost:8080/api/v1/dev/aigateway/agents/.well-known/ai-gk-chatbot.json");

  const streamParams: MessageSendParams = {
    message: {
      messageId: uuidv4(),
      role: "user",
      parts: [{ kind: "text", text: "Describe nuclear fusion and fission" }],
      kind: "message",
      metadata: {
        modelParams: {
          max_completion_tokens: 1800,
          user: "user-rapid7",
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.1,
          top_p: 0.1,
          presence_penalty: 0,
          frequency_penalty: 0
        }
      }
    }
  };

  let recv_data = '';
  try {
    const stream = client.sendMessageStream(streamParams);
    for await (const event of stream) {
      if (event.kind === "task") {
        console.log(`[${event.id}] Task created. Status: ${event.status.state}`);
      } else if (event.kind === "status-update") {
        console.log(`[${event.taskId}] Status Updated: ${event.status.state}`);
      } else if (event.kind === "artifact-update") {
        for (const part of event.artifact.parts) {
          if (part.kind === "text") {
            recv_data += part.text;
          } else if (part.kind === "file") {
            // handle file part
          } else if (part.kind === "data") {
            // handle data part
          }
        }
        console.log(`[${event.taskId}] Artifact ID: ${event.artifact.artifactId}\nData:\n${JSON.stringify(event.artifact.parts, null, 2)}`);
      }
    };

    console.log("--- Stream finished ---");
    console.log(`Received data:\n${recv_data}`);
  } catch (error) {
    console.error("Error during streaming:", error);
  }
}

main().catch(err => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});