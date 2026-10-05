curl -X POST http://localhost:8080/api/v1/dev/aigateway/agents/ai-gk-chatbot/invoke \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
  "jsonrpc": "2.0",
  "method": "message/stream",
  "params": {
    "message": {
      "kind": "message",
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "Top 4 beaches in CA?"
        }
      ],
      "messageId": "msg-12345",
      "metadata": {
        "modelParams": {
          "max_completion_tokens": 1800,
          "user": "user-rapid7",
          "stream": true,
          "stream_options": { "include_usage": true },
          "temperature": 0.1,
          "top_p": 0.1,
          "presence_penalty": 0,
          "frequency_penalty": 0
        }
      }
    }
  },
  "id": 43
}'