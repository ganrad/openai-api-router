docker run -e FRONTEND_SRV_HOST='0.0.0.0' -e FRONTEND_SRV_CONFIG_FILE=./app-config-test.json -e API_GATEWAY_AUTH="false" --name ai-gtwy-console-dev -p 8000:8000 -d ai-app-gateway-console
