# o1-mini 09-12-2024
# curl -X POST "https://gbb-ea-aoai-swedencentral-shared-reasoning.openai.azure.com/openai/deployments/o1-mini/chat/completions?api-version=2024-10-21" \
# o1 12-17-2024
curl -X POST "https://gbb-ea-aoai-swedencentral-shared-reasoning.openai.azure.com/openai/deployments/o1/chat/completions?api-version=2024-12-01-preview" \
    -H "Content-Type: application/json" \
    -H "api-key: c254400f4fab4618b585e34712820960" \
    -v \
    -d '{
        "messages": [
            {
                "role": "user",
                "content": "I am going to Paris, what should I see?"
            }
        ],
        "temperature": 1.0,
        "top_p": 1.0,
        "max_completion_tokens": 10000,
        "model": "o1-2024-12-17"
    }' | jq .
