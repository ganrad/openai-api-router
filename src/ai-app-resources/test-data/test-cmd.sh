curl -d @app-deploy.json -H "Content-Type: application/json" -X POST http://localhost:8080/api/v1/dev/apirouter/cp/RagApplication/deploy | jq .
