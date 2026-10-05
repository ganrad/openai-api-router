echo "--------------------------------------------"
echo "***** Azure OpenAI API *****"
echo "--------------------------------------------"
curl https://oai-gr-dev.openai.azure.com/openai/deployments/dev-embedd-ada-002/embeddings?api-version=2023-05-15 \
  -H "Content-Type: application/json" \
  -H "api-key: 9eca9ec12e1e4be4a38d00282f0d266d" \
  -d "{\"input\": \"The food was delicious and the waiter...\"}"

echo "--------------------------------------------"
echo "***** AI Application Gateway API *****"
echo "--------------------------------------------"
curl http://$1:$2/api/v1/dev/apirouter/lb/vectorizedata \
  -X POST \
  -H "Content-Type: application/json" \
  -d @oai-vector-data.json | jq .
