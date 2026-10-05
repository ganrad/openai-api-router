# curl https://oai-gr-test.openai.azure.com/openai/deployments/test-gpt35-turbo-instruct/completions?api-version=2023-05-15 \
# -H "api-key: 9eca9ec" \

i=0
while [ $i -le 2000 ]
do
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"List top 10 chefs in the world\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"List top 10 tallest mountains in the world\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"List top 10 billboard charts from 1995\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Describe Gauss's law\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Describe the top 1o physics laws\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Describe Newton's laws of motion\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Explain the Archimedes principle\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Describe renewable energy\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Describe how locomotive engines work?\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"I would like to learn more about ship building.  Who are the top ship builders in the world?\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"List the top 5 bollywood movies of all times\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Summarize the plot of Casino Royale 007 movie\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Explain how the turbo works in a gasoline engine.  What are it's benefits?\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Explain the game of baseball\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Tell me about the top places to visit in Scandinavia\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Tell me about the suez and panama canals\"}], \"max_completion_tokens\": 1000}" | jq .
  curl http://$1:$2/api/v1/test/aigateway/lb/ai-gk-chatbot -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Who are the super powers in the world today and why?\"}], \"max_completion_tokens\": 1000}" | jq .
  ((i++))
  sleep 2
done
