i=1
while [ $i -le 1 ]
do
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-01.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-02.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-03.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-04.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-05.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-06.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l?use_cache=false \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-07.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-08.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-09.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-10.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-11.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-12.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-13.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-14.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/ai-chatbot-v2.3.9-gpt4o-mini-l \
    -v \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-15.json | jq . 

  ((i++))
  # sleep 25
done
