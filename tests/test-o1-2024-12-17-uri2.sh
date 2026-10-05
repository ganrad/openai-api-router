#curl -X POST "https://gbb-ea2-openai-o1-swedencentral-01.openai.azure.com/openai/deployments/o1-2024-12-17/chat/completions?api-version=2024-12-01-preview" \
# -H "api-key: G5M45wIUS3Gi1BmKwtGn6gU4RChbt3Xa2phA5ZkYNeC5UCfjMhjkJQQJ99ALACfhMk5XJ3w3AAABACOGeLDk" \
curl -X POST "https://gbb-ea-aoai-swedencentral-shared-reasoning.openai.azure.com/openai/deployments/o1-mini/chat/completions?api-version=2024-10-21" \
    -H "Content-Type: application/json" \
    -H "api-key: c254400f4fab4618b585e34712820960" \
    -d '{
        "messages": [
            {
                "role": "user",
                "content": "What steps should I think about when writing my first Python API?"
            }
        ]
    }'
