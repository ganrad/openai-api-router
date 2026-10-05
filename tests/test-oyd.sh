i=1
while [ $i -le 1 ]
do
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @stip-data-01.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @stip-data-02.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp?use_cache=false \
    -X POST \
    -H "Content-Type: application/json" \
    --data @stip-data-03.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-03.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp?use_cache=false \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-04.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-05.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-06.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-07.json | jq . 
  curl http://$1:$2/api/v1/dev/apirouter/lb/aichatbotapp \
    -X POST \
    -H "Content-Type: application/json" \
    --data @chat-bot-data-08.json | jq . 

  ((i++))
  # sleep 25
done
