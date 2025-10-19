// streamingClient.js
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

// Define the URL for the A2A server's Agent Card.
// The server at this URL must support streaming.
const agentCardUrl = 'https://{host}:{port}/api/v1/dev/aigateway/agents/.well-known/{agent-name}.json';

async function streamMessageAndProcessEvents(messageText) {
  let response = "";
  try {
    // 1. Create the A2A client from the server's Agent Card URL.
    const client = await A2AClient.fromCardUrl(agentCardUrl);

    // 2. Define the message payload, including a unique ID.
    const messagePayload = {
      message: {
        messageId: uuidv4(),
        kind: 'message',
        role: 'user',
        parts: [{
          kind: 'text',
          text: messageText,
        }],
        metadata: {
          modelParams: {
            temperature: 0.5,
            max_completion_tokens: 1000
          }
        }
      }
    };

    // 3. Initiate the streaming call.
    console.log('Initiating stream to agent...');
    const stream = await client.sendMessageStream(messagePayload);

    // 4. Process events from the stream.
    for await (const event of stream) {

      switch (event.kind) {
        case 'task':
          // The first event is often the initial task object.
          console.log(`\n--- Initial Task Received ---`);
          console.log(`Task ID: ${event.id}`);
          console.log(`State: ${event.status.state}`);
          if (event.status.message) {
            // Print any intermediate message from the agent.
            for (const part of event.status.message.parts) {
              if (part.kind === 'text') {
                process.stdout.write(`Agent update: ${part.text}`);
              }
            }
          };
          if (event.metadata.cached) {
            // Cached response is being returned
            const artifacts = event.artifacts;
            response = artifacts[0].parts[0].text;
          };
          break;

        case 'status-update':
          // A TaskStatusUpdateEvent provides progress updates.
          console.log(`\n--- Status Update ---`);
          console.log(`Task ID: ${event.taskId}`);
          console.log(`State: ${event.status.state}`);
          if (event.status.message) {
            // Print any intermediate message from the agent.
            for (const part of event.status.message.parts) {
              if (part.kind === 'text') {
                process.stdout.write(`Agent update: ${part.text}`);
              }
            }
          }
          if (event.final) {
            console.log(`\n--- Stream marked as FINAL. ---`);
          }
          break;

        case 'artifact-update':
          // A TaskArtifactUpdateEvent delivers a part of the final output.
          console.log(`\n--- Artifact Update ---`);
          console.log(`Task ID: ${event.taskId}`);
          const artifact = event.artifact;
          if (artifact && artifact.parts) {
            for (const part of artifact.parts) {
              if (part.kind === 'text') {
                // `process.stdout.write` is used to print chunks of text
                // incrementally without adding a newline each time.
                process.stdout.write(part.text);
                response += part.text;
              }
            }
          }
          break;

        default:
          console.log(`\n\nReceived unknown event kind: ${event.kind}`, event);
          break;
      }
    }

    console.log('\nStream completed.');
    console.log('\nAgent Response:\n' + response);
  } catch (error) {
    console.error('\nFailed to communicate with the A2A server:', error);
  }
}

// Call the function with your desired message for streaming.
await streamMessageAndProcessEvents('Tell me about the tallest peaks in the world ...');
