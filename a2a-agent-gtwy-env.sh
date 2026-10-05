export API_GATEWAY_ID="A2A-Agent-Gateway"

# ID05182026.n: AI Gateway Type is no longer required to be set!  It will default to 'single-domain'.
# In the next release, gateway types will be refactored and possible values would be single agent or multi agent.
export API_GATEWAY_TYPE="single-domain"

export API_GATEWAY_CONFIG_FILE="./a2a-server-v3-test.json"

# Host where the AI App Gateway/Server is running
export API_GATEWAY_HOST="gr-dev-vm.westus2.cloudapp.azure.com"

export API_GATEWAY_PORT=8081
# The AI Application Gateway / Server deployment environment - dev, test, preprod or prod
export API_GATEWAY_ENV="test"
# The AI Application Gateway / Server log level - trace, debug, info, warn, fatal.
export API_GATEWAY_LOG_LEVEL="debug"

# Secure Gateway APIs
export API_GATEWAY_AUTH="false"
# Azure Tenant ID
export AZURE_TENANT_ID="c2236a74-6f69-4313-b77b-8a5360c27e88"
# Azure API Gateway Client ID - OLD
# export API_GATEWAY_CLIENT_ID="ea069e81-89ea-4977-85ea-9903697bf41c"
# AI Application Gateway Client ID - NEW
export API_GATEWAY_CLIENT_ID="d6f77270-40a8-4a12-ab15-f3bf812529f9"
# Use RAPID host's system managed identity to authenticate against Azure AI Service
export AZURE_AI_SERVICE_MID_AUTH="true"

# API Gateway Key
export API_GATEWAY_KEY="abcxyz"

# Metrics collection env variables

# Specify metrics collection interval in minutes
# export API_GATEWAY_METRICS_CINTERVAL=60
export API_GATEWAY_METRICS_CINTERVAL=5

# Specify the number of metrics collection buckets to save (in memory).
# For instance, the example below stores metrics for the past one week (24 * 7)
# export API_GATEWAY_METRICS_CHISTORY=168
export API_GATEWAY_METRICS_CHISTORY=12

# (Optional) Set this value to Azure Application Insights resource connection string
export APPLICATIONINSIGHTS_CONNECTION_STRING="InstrumentationKey=59de47b3-46f6-4d83-b0db-caa8c96adfe7;IngestionEndpoint=https://westus2-2.in.applicationinsights.azure.com/;LiveEndpoint=https://westus2.livediagnostics.monitor.azure.com/;ApplicationId=343c7a4f-b634-46fb-a317-0ea9e5f6d29f"

# (Optional) Global setting - Use cached retrieval?
export API_GATEWAY_USE_CACHE="true"

# (Optional) Cache entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_CACHE_INVAL_SCHEDULE="*/4 * * * *"

# (Optional) Global setting - Use memory / state management?
export API_GATEWAY_STATE_MGMT="true"

# (Optional) Memory entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_MEMORY_INVAL_SCHEDULE="*/4 * * * *"

# (Optional) Global setting - Persist prompts in a DB?
export API_GATEWAY_PERSIST_PROMPTS="true"

# AI Application that exposes vectorization model
export API_GATEWAY_VECTOR_AIAPP="vectorizedata"
# export API_GATEWAY_VECTOR_AIAPP="vec-data-text-embedding-3-small"

# Search engine - only pgvector is supported!
export API_GATEWAY_SRCH_ENGINE="Postgresql/pgvector"

# Vector DB host, port, name, uname and user pwd
export VECTOR_DB_NAME="aoaisvc"
export VECTOR_DB_HOST="gr-apig-dev-pg.postgres.database.azure.com"
export VECTOR_DB_USER="gradmin"
export VECTOR_DB_UPWD="Gbb-2024"
export VECTOR_DB_PORT="5432"