# curl https://oai-gr-dev.openai.azure.com/openai/deployments/dev-gpt35-turbo-instruct/completions?api-version=2023-05-15 \
# -H "api-key: 9eca9ec" \

i=0
while [ $i -le 50 ]
do
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  curl http://localhost:8000/api/v1/dev/apirouter/lb -H "Content-Type: application/json" -d "{\"prompt\": \"Once upon a time\", \"max_tokens\": 500}" | jq .
  ((i++))
  # sleep 2
done
