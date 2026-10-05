curl http://$1:$2/api/v1/dev/apirouter/lb/content-safety-app \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-cs-text.json | jq .
