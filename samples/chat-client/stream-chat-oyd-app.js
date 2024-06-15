// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Demonstrates how to use Azure's Bring Your Own Data with Azure OpenAI Chat Completions.
 *
 * @summary chat completions with your own data.
 */

const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");

// Load the .env file if it exists
require("dotenv").config();

// You will need to set these environment variables or edit the following values
// The endpoint you will use to access your Azure OpenAI instance
const endpoint = process.env["ENDPOINT"] || "<endpoint>";
// Your Azure OpenAI API key
const azureApiKey = process.env["AZURE_API_KEY"] || "<api key>";
// Your Azure Cognitive Search endpoint, admin key, and index name
const azureSearchEndpoint = process.env["AZURE_SEARCH_ENDPOINT"] || "<search endpoint>";
const azureSearchAdminKey = process.env["AZURE_SEARCH_KEY"] || "<search key>";
const azureSearchIndexName = process.env["AZURE_SEARCH_INDEX"] || "<search index>";

const messages = [
  {
    role: "system",
    content: "You are a helpful AI Assistant trained by OpenAI"
  },
  {
    role: "user",
    content: "What are the top 2 features of Garmin Zumo XT2"
  }
];

async function main() {
  console.log("== Bring Your Own Data Sample ==");

  const client = new OpenAIClient(endpoint,new AzureKeyCredential(azureApiKey), { allowInsecureConnection: true });
  // const client = new OpenAIClient(endpoint, new AzureKeyCredential(azureApiKey));
  const deploymentId = "ai-doc-assistant-gpt-4t-0125";
  const events = await client.streamChatCompletions(deploymentId, messages, {
    maxTokens: 500,
    /**
     * The `azureExtensionOptions` property is used to configure the
     * Azure-specific extensions. In this case, we are using the
     * Azure Cognitive Search extension with a vector index to provide
     * the model with additional context.
     */
    azureExtensionOptions: {
      extensions: [
        {
          type: "azure_search",
          endpoint: azureSearchEndpoint,
          indexName: azureSearchIndexName,
          authentication: {
            type: "api_key",
            key: azureSearchAdminKey,
          },
        },
      ],
    },
  });

  for await (const event of events) {
    for (const choice of event.choices) {
      if ( choice.delta?.context ) {
        console.log("-------- CITATIONS ----------");
        for (const cit of choice.delta?.context.citations) {
          console.log(`************* Title: ${cit.title}; Filepath: ${cit.filepath} ***************`);
	  console.log(`************* Content *****************\n${cit.content}`);
	};
        console.log("-------- COMPLETION ----------");
      }
      else {
        console.log(choice.delta?.content);
      };
    }
  }
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});

module.exports = { main };
