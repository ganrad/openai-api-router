// const fetch = require('node-fetch');
const { Readable } = require('stream');

async function getStreamedResponse() {
    // const url = 'https://oai-gr-dev-wus3.openai.azure.com/openai/deployments/gpt-4o-wus3/chat/completions?api-version=2024-08-01-preview';
    const url = 'http://localhost:8080/api/v1/dev/apirouter/lb/ai-chatbot-gpt4o';
    const apiKey = '65d72ca615c44aacaa5d8e19c50eef81';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // 'api-key': apiKey
        },
        body: JSON.stringify({
          messages: [
            {role: "system", content: "Assistant is a large language model trained by OpenAI."},
            {role: "user", content: "How does a car's hybrid engine work?"}
          ],
          max_tokens: 1000,
          user: "rapid",
          stream: true,
	  stream_options: { include_usage: true }
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;

    while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        const chunk = decoder.decode(value, { stream: true });
        console.log(chunk);
    }
}
 
async function getStreamedResponse1() {
    const url = 'https://oai-gr-dev-wus3.openai.azure.com/openai/deployments/gpt-4o-wus3/chat/completions?api-version=2024-08-01-preview';
    const apiKey = '65d72ca615c44aacaa5d8e19c50eef81';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify({
          messages: [
            {role: "system", content: "Assistant is a large language model trained by OpenAI."},
            {role: "user", content: "How does a car's hybrid engine work?"}
          ],
          max_tokens: 1000,
          user: "rapid",
          stream: true
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = Readable.from(response.body);
    reader.on('data', (chunk) => {
        console.log(chunk.toString());
    });

    reader.on('end', () => {
        console.log('Stream ended');
    });
}

getStreamedResponse().catch(console.error);
