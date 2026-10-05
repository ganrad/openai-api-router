response_headers=$(curl -s -D - -o /dev/null http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
  -X POST \
  -H "Content-Type: application/json" \
  --data @chat-bot-cstate-01.json)

thread_id=$(echo "$response_headers" | grep -i '^x-thread-id:' | awk '{print $2}')

curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp -X POST -H "Content-Type: application/json" -H "x-thread-id: $thread_id" --data @chat-bot-cstate-02.json | jq . 
