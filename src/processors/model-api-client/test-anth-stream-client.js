'use strict';

const { AnthropicClient } = require('./anthropic-client');

async function main() {
  const client = new AnthropicClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeoutMs: 120_000,
  });

  const baseParams = {
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: 'You are a concise, helpful assistant.',
    messages: [
      { role: 'user', content: 'In two sentences, what is provisioned throughput?' },
    ],
  };

  // ---- 1) NON-STREAMING ----
  console.log('\n=== Non-streaming ===');
  const msg = await client.createMessage(baseParams);
  const fullText = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  console.log(fullText);
  console.log('Usage:', msg.usage);

  // ---- 2) STREAMING (live tokens) ----
  console.log('\n=== Streaming ===');
  const { text, usage } = await client.streamToText(baseParams, {
    onDelta: (chunk) => process.stdout.write(chunk),
  });
  console.log('\n--- assembled length:', text.length);
  
  console.log('\n--- token usage ---');
  console.log('Input tokens        :', usage.input_tokens);
  console.log('Cache read tokens   :', usage.cache_read_input_tokens);
  console.log('Cache write tokens  :', usage.cache_creation_input_tokens);
  console.log('Output tokens       :', usage.output_tokens);
  console.log('Total input tokens  :', usage.total_input_tokens);
  console.log('Total tokens        :', usage.total_tokens);

  // ---- 3) STREAMING (raw event loop, full control) ----
  console.log('\n=== Streaming (raw events) ===');
  for await (const { event, data } of client.streamMessage(baseParams)) {
    if (event === 'content_block_delta' && data.delta?.type === 'text_delta') {
      process.stdout.write(data.delta.text);
    } else if (event === 'message_stop') {
      console.log('\n[stream complete]');
    }
  }
}

main().catch((err) => {
  console.error('\nRequest failed:', err.message);
  if (err.status) console.error('Status:', err.status, '| Type:', err.type);
  process.exit(1);
});