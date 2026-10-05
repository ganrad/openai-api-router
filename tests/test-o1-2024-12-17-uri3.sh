curl -X POST "https://gbb-ea2-openai-o1-swedencentral-01.openai.azure.com/openai/deployments/o1-2024-12-17/chat/completions?api-version=2024-12-01-preview" \
    -H "Content-Type: application/json" \
    -H "api-key: G5M45wIUS3Gi1BmKwtGn6gU4RChbt3Xa2phA5ZkYNeC5UCfjMhjkJQQJ99ALACfhMk5XJ3w3AAABACOGeLDk" \
    -d '{ "messages": [ { "role": "developer", "content": [ {"type": "text", "text": "You are a Python programming language expert"} ] }, { "role": "user", "content": [ {"type": "text", "text": "What steps should I think about when writing my first Python API?"} ] } ]}'
