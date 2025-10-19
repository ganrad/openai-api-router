// a2a-client-node.js
import { A2AClient } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

// Define the URL for the A2A server's Agent Card.
const agentCardUrl = 'https://{host}:{port}/api/v1/dev/aigateway/agents/.well-known/{agent-name}.json';

async function sendMessageToAgent(messageText) {
  try {
    // 1. Create the A2A client by discovering the server's capabilities from its Agent Card URL.
    const client = await A2AClient.fromCardUrl(agentCardUrl);

    // 2. Define the message payload, including a unique message ID and the user's text.
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
            temperature: 0.4,
            max_completion_tokens: 1000
          }
        }
      },
    };

    // 3. Send the message and await the server's response.
    const response = await client.sendMessage(messagePayload);

    // 4. Handle the response, checking for errors.
    if ('error' in response) {
      console.error('Error from agent:', response.error.message);
    } else {
      // The `result` field will contain the agent's reply message.
      const agentReply = response.result.artifacts[0].parts[0].text;
      console.log('Agent replied:', agentReply);
    }

  } catch (error) {
    console.error('Failed to communicate with the A2A server:', error);
  }
}

// Call the function with your desired message.
await sendMessageToAgent('What are the top frameworks for building AI agentic workflows?');
