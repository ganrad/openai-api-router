curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-gpt4o \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data.json | jq .
