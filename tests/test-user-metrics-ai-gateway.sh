targetUri="http://${1}:${2}/api/v1/test/aigateway/usermetrics/ai-multi-domain-agent?userName=ganrad&from=2026-09-30T19%3A49%3A00.000Z&to=2026-09-30T20%3A49%3A00.000Z&bucket=1h&topThreads=20"

curl -s "$targetUri" -H "Content-Type: application/json" | jq .
