/**
 * Name: A simple AI Chatbot CLI client
 * Description: Use this client to test the 'state manager' feature of AI Services API Gateway
 * To quit the client, enter 'quit' or 'exit' at the command prompt
 * To start a new user session, enter 'clear' in the prompt.  This will clear the 'threadId' sent in the http 
 * request header and initiate a new user session.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-06-2024
 *
 * Notes:
 *
*/

const readline = require("readline");
const fetch = require("node-fetch");

// Important: Change the AI Services API Gateway URL below. Also specify the correct AI Application name!!
const url = "http://localhost:8000/api/v1/dev/apirouter/lb/aichatbotapp";

const userInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "You >> "
});

let hdrs = new Map();

// Specify, additional params as needed.
let prompt = {
    messages: [],
    max_tokens: 1000,
    user: "ganeshra",
    stream: false
};

// Adjust the system prompt as needed
const sysPrompt = "Assistant is a large language model trained by OpenAI.";

// Use dataSource for OYD call
let dataSource = [
  {
    type: "azure_search",
    parameters: {
      endpoint: "https://gr-dev-rag-ais.search.windows.net",
      index_name: "ak-stip-v2",
      authentication: {
        type: "api_key",
        // key: "3Eo1xEcFxzSe"  // Specify the API Key for chat completion + OYD calls
	key: "" // Specify an empty key for chat completion calls
      }
    }
  }
];

let threadId = null;

userInterface.prompt();

async function callApiGateway(input) {
  let requestHeaders = null;
  prompt.messages.length = 0;
  if ( threadId) {
    hdrs.set("x-thread-id",threadId);
    requestHeaders = new Headers(hdrs);

    if ( prompt.data_sources )
      delete prompt.data_sources;

    prompt.messages.push({ role: "user", content: input });
  }
  else {
    hdrs.clear();
    hdrs.set("Content-Type", "application/json");

    requestHeaders = new Headers(hdrs);
    if ( dataSource[0].parameters.authentication.key )
      prompt.data_sources = dataSource;
    prompt.messages.push({role: "system", content: sysPrompt})
    prompt.messages.push({role: "user", content: input});
  };

  let data = null;
  try {
    const response = await fetch(url,{
      method: "POST",
      body: JSON.stringify(prompt),
      headers: requestHeaders});
    
    data = await response.json();
    if ( response.ok ) {
      threadId = response.headers.get("x-thread-id");
      console.log(`Bot >>\nThread ID: ${threadId}\nResponse data:\n${JSON.stringify(data.choices[0].message)}`);
    }
    else {
      console.error(`Error:\nStatus: ${response.status}\nText: ${response.statusText}\nMessage: ${JSON.stringify(data)}` );
    }
  }
  catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  };
  
  return data;
}

function parseInput(input) {
  const exitCommand = /^exit$/;
  const quitCommand = /^quit$/;
  const clearCommand = /^clear$/;
  
  if ( input.toLowerCase().match(exitCommand) || input.toLowerCase().match(quitCommand) ) {
    console.log("Exiting the AI Chat client.  Good Bye.");

    process.exit(0);
  };

  if ( input.toLowerCase().match(clearCommand) ) {
    console.log("Successfully reset the user session");
    // Reset thread id
    threadId = null;

    return(true);
  };

  return(false);
}

userInterface.on("line", async (input) => {
  if ( parseInput(input) || await callApiGateway(input) )
    userInterface.prompt();
});
