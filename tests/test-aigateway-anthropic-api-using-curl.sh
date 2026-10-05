curl -N -s https://az-ai-app-gateway.whiteground-1e998745.westus2.azurecontainerapps.io/api/v1/test/aigateway/lb/ai-claude-test-agent \
-H "content-type: application/json" \
-d '{"model":"claude-haiku-4-5","max_tokens":1000,"messages":[{"role":"user","content":"Implement the towers on hanoi in Go programming language"}],"stream":true}' \
| while IFS= read -r line; do echo "$(date '+%H:%M:%S.%3N') ${line:0:500}"; done
