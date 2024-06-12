// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Demonstrates how to list chat completions for a chat context.
 *
 * @summary list chat completions.
 */

const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

// Load the .env file if it exists
require("dotenv").config();

// You will need to set these environment variables or edit the following values
const endpoint = process.env["ENDPOINT"] || "<endpoint>";
const azureApiKey = process.env["AZURE_API_KEY"] || "<api key>";

let threadId = null;

async function main() {
  console.log("== Streaming Chat Completions Sample ==");

  // const client = new OpenAIClient(endpoint,new AzureKeyCredential(azureApiKey));
  const clientOptions = {
    allowInsecureConnection: true,
    additionalPolicies: [
      {
        policy: {
	  name: "Thread-Policy",
	  sendRequest: async function (req,next) {
	    if ( threadId )
	      req.headers.set("x-thread-id",threadId);

	    let pipeResponse = await next(req, next);
	    threadId = pipeResponse.headers.get("x-thread-id");
	    console.log(`THREAD-ID: ${threadId}`);

	    return pipeResponse;
	  }
	},
	position: "perCall"
      }
    ]
  }
  // const client = new OpenAIClient(endpoint,new AzureKeyCredential(azureApiKey), { allowInsecureConnection: true });
  const client = new OpenAIClient(endpoint,new AzureKeyCredential(azureApiKey), clientOptions);
  const deploymentId = "aichatbotapp"; // "dev-gpt35-turbo-16k"; // "gpt-35-turbo";
  let events = await client.streamChatCompletions(
    deploymentId,
    [
      { role: "system", content: "You are a helpful AI assistant." },
      { role: "user", content: "What are the top 10 must see places in the world?" },
    ],
    { maxTokens: 500 },
  );

  for await (const event of events) {
    for (const choice of event.choices) {
      console.log(choice.delta?.content);
    }
  }

  // Uncomment below lines to enable and test 'state management'
  /* events = await client.streamChatCompletions(
    deploymentId,
    [
      { role: "user", content: "What is the best time of the year to visit attraction no. 9?" },
    ],
    { maxTokens: 500 },
  );

  for await (const event of events) {
    for (const choice of event.choices) {
      console.log(choice.delta?.content);
    }
  } */
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});

module.exports = { main };
