/**
 * Name: client.ts
 * Description: Sample non-streaming A2A client
 * Date: 10-10-2025
 * Version (Introduced): 2.7.0
 * 
 */

import { A2AClient } from "@a2a-js/sdk/client";
import { Task, MessageSendParams } from "@a2a-js/sdk";
import { v4 as uuidv4 } from "uuid";

async function main() {
  // Create a client pointing to the agent's Agent Card URL.
  // Agent Registry URI: http://{API_GATEWAY_HOST}:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/aigateway/agents/.well-known/agents.json 
  // Agent URI: http://{API_GATEWAY_HOST}:{API_GATEWAY_PORT}/api/v1/{API_GATEWAY_ENV}/aigateway/agents/.well-known/{AI_APPLICATION_ID}.json
  const client = await A2AClient.fromCardUrl("http://localhost:8080/api/v1/dev/aigateway/agents/.well-known/ai-gk-chatbot.json");

  const sendParams: MessageSendParams = {
    message: {
      messageId: uuidv4(),
      role: "user",
      parts: [{ kind: "text", text: "Give me the top 5 universities for computer science engineering in the US" }],
      kind: "message",
    },
  };

  const response = await client.sendMessage(sendParams);

  if ("error" in response) {
    console.error("Error:", response.error.message);
  } else {
    const result = response.result as Task;
    console.log("Agent response:", JSON.stringify(result, null, 2)); // print the result (Task object)
  }
}

main().catch(err => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});