# curl https://oai-gr-dev.openai.azure.com/openai/deployments/dev-gpt35-turbo-instruct/completions?api-version=2023-05-15 \
curl http://localhost:8000/api/v1/dev/apirouter/lb \
  -H "Content-Type: application/json" \
  -H "api-key: 9eca9ec12e1e4be4a38d00282f0d266d" \
  -d "{\"prompt\": \"Once upon a time\"}"
