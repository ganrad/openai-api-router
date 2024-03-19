/**
 * Important:
 * When calling the API Gateway load balancer endpoint from LangChain based
 * application, set the following values. 
 * 1) Set environment variable 'AZURE_OPENAI_BASE_PATH' to the gateway's
 * load balancer endpoint.  Refer to the example below.
 * 2) Set environment variable 'AZURE_OPENAI_API_DEPLOYMENT_NAME' to the
 * AI application ID/Name configured on the gateway.
 * The above two values can also be specified with the OpenAI configuration
 * object. Refer to the code below.
*/
import { OpenAI, ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Completions example
let model = new OpenAI({
  temperature: 0.9,
  azureOpenAIApiKey: "SOME_SECRET_VALUE", // In Node.js defaults to process.env.AZURE_OPENAI_API_KEY
  azureOpenAIApiVersion: "YOUR-API-VERSION", // In Node.js defaults to process.env.AZURE_OPENAI_API_VERSION
  azureOpenAIApiDeploymentName: "aidocusearchapp", // In Node.js defaults to process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
  azureOpenAIBasePath:
    "http://localhost:8000/api/v1/dev/apirouter/lb", // In Node.js defaults to process.env.AZURE_OPENAI_BASE_PATH
});

let prompt = "What would be a good company name for a company that makes speed boats?";
let response = await model.invoke(prompt);

console.log("****\nCompletions API:\n  Request: " + prompt + "\n  Response: " + response + "\n****");

// Chat completions example
prompt = ChatPromptTemplate.fromMessages([
  ["human", "Tell me a short joke about {topic}"],
]);

model = new ChatOpenAI({
  temperature: 0.9,
  azureOpenAIApiKey: "SOME_SECRET_VALUE", // In Node.js defaults to process.env.AZURE_OPENAI_API_KEY
  azureOpenAIApiVersion: "YOUR-API-VERSION", // In Node.js defaults to process.env.AZURE_OPENAI_API_VERSION
  azureOpenAIApiDeploymentName: "aichatbotapp", // In Node.js defaults to process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME
  azureOpenAIBasePath:
    "http://localhost:8000/api/v1/dev/apirouter/lb", // In Node.js defaults to process.env.AZURE_OPENAI_BASE_PATH
});

let outputParser = new StringOutputParser();

let chain = prompt.pipe(model).pipe(outputParser);

response = await chain.invoke({
  topic: "Twins",
});

console.log("****\nChat Completions API:\n  Request: " + JSON.stringify(prompt) + "\n  Response: " + response + "\n****");
