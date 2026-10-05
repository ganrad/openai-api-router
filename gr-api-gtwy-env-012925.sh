export API_GATEWAY_CONFIG_FILE="./api-router-config-test.json"
# export API_GATEWAY_NAME="Gateway-Instance-01"
export API_GATEWAY_PORT=8080
export API_GATEWAY_ENV="dev"
export API_GATEWAY_LOG_LEVEL="debug"

# Secure Gateway APIs
export API_GATEWAY_AUTH="false"
# Azure Tenant ID
export AZURE_TENANT_ID="c2236a74-6f69-4313-b77b-8a5360c27e88"
# Azure API Gateway Client ID
export API_GATEWAY_CLIENT_ID="ea069e81-89ea-4977-85ea-9903697bf41c"

# API Gateway Key
export API_GATEWAY_KEY="abcxyz"

# Metrics collection env variables

# Specify metrics collection interval in minutes
export API_GATEWAY_METRICS_CINTERVAL=60

# Specify the number of metrics collection buckets to save (in memory).
# For instance, the example below stores metrics for the past one week (24 * 7)
export API_GATEWAY_METRICS_CHISTORY=168

# (Optional) Set this value to Azure Application Insights resource connection string
export APPLICATION_INSIGHTS_CONNECTION_STRING=""

# (Optional) Global setting - Use cached retrieval?
export API_GATEWAY_USE_CACHE="true"

# (Optional) Cache entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_CACHE_INVAL_SCHEDULE="*/2 * * * *"

# (Optional) Global setting - Use memory / state management?
export API_GATEWAY_STATE_MGMT="true"

# (Optional) Memory entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_MEMORY_INVAL_SCHEDULE="*/4 * * * *"

# (Optional) Global setting - Persist prompts in a DB?
export API_GATEWAY_PERSIST_PROMPTS="true"

# AI Application that exposes vectorization model
export API_GATEWAY_VECTOR_AIAPP="vectorizedata"

# Search engine - only pgvector is supported!
export API_GATEWAY_SRCH_ENGINE="Postgresql/pgvector"

# Vector DB host, port, name, uname and user pwd
export VECTOR_DB_NAME="aoaisvc"
export VECTOR_DB_HOST="gr-apig-dev-pg.postgres.database.azure.com"
export VECTOR_DB_USER="gradmin"
export VECTOR_DB_UPWD="Gbb-2024"
export VECTOR_DB_PORT="5432"
