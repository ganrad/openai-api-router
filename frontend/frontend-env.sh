# AI Application API Gateway load balancer endpoint
export API_GATEWAY_URI="http://4.242.16.181:8080/api/v1/dev/apirouter/lb/"

# Are AI Application Gateway APIs secured?
export API_GATEWAY_AUTH="true"
# Azure Tenant ID
export AZURE_TENANT_ID="c2236a74-6f69-4313-b77b-8a5360c27e88"
# Web frontend Client ID
export FRONTEND_CLIENT_ID="dd5d5c33-a90f-459c-9b1f-64e654ce5f20"
# AI Application Gateway Entra Application ID
export API_GATEWAY_APP_ID="api://ea069e81-89ea-4977-85ea-9903697bf41c"

# Frontend chat application (SPA) configuration file
export FRONTEND_SRV_CONFIG_FILE="./app-config.json"

# Frontend server host
export FRONTEND_SRV_HOST="10.0.0.4"
