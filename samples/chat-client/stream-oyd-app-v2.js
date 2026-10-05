// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Demonstrates how to use Azure's Bring Your Own Data with Azure OpenAI Chat Completions.
 *
 * @summary chat completions with your own data.
 */

const { AzureOpenAI } = require("openai");
const { DefaultAzureCredential, getBearerTokenProvider } = require("@azure/identity");

// Set AZURE_OPENAI_ENDPOINT to the endpoint of your
// OpenAI resource. You can find this in the Azure portal.
// Load the .env file if it exists
require("dotenv/config");

// Your Azure Cognitive Search endpoint, and index name
// const azureSearchEndpoint = process.env["AZURE_SEARCH_ENDPOINT"] || "<search endpoint>";
// const azureSearchIndexName = process.env["AZURE_SEARCH_INDEX"] || "<search index>";

async function main() {
    console.log("== On Your Data Sample ==");

    const scope = "https://cognitiveservices.azure.com/.default";
    const azureADTokenProvider = getBearerTokenProvider(new DefaultAzureCredential(), scope);
    const deployment = "gpt-4o-mini";
    const apiVersion = "2024-10-21";
    const client = new AzureOpenAI({ azureADTokenProvider, deployment, apiVersion });
    const events = await client.chat.completions.create({
        stream: true,
        stream_options: { include_usage: true },
        messages: [
            {
                role: "system",
                content: "You are a helpful AI Assistant"
            },
            {
                role: "user",
                content:
                    "What are the top 2 features of Garmin Zumo XT2",
            },
        ],
        max_tokens: 128,
        model: "",
        data_sources: [
            {
                type: "azure_search",
                parameters: {
                    endpoint: "https://gr-dev-rag-ais.search.windows.net",
                    index_name: azureSearchIndexName,
                    authentication: {
                        type: "system_assigned_managed_identity",
                    },
                },
            },
        ],
    });

    for await (const event of events) {
        for (const choice of event.choices) {
            console.log(choice.delta?.content);
        }
    }
}

main().catch((err) => {
    console.error("The sample encountered an error:", err);
});

module.exports = { main };