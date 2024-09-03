# The AI Application Gateway / Server configuration file
export API_GATEWAY_CONFIG_FILE="./api-router-config.json"
# The AI Application Gateway / Server listen port
export API_GATEWAY_PORT=8000
# The AI Application Gateway / Server deployment environment.  For instance, dev, test, pre-prod, producution ...
export API_GATEWAY_ENV="dev"
# The AI Application Gateway / Server log level - trace, debug, info, warn, fatal.
export API_GATEWAY_LOG_LEVEL="info"

# Secure Gateway APIs? [ "true" | "false" ]
# DEFAULT: "true" (Secure the AI Application Gateway endpoints using Microsoft Entra ID)
export API_GATEWAY_AUTH="true"
# Azure Tenant ID
export AZURE_TENANT_ID="[Specify Azure Tenant ID]"
# Microsoft Entra API Gateway Client ID
export API_GATEWAY_CLIENT_ID="[Specify Microsoft Entra AI Application Gateway Client ID]"

# AI Application Gateway Security Key.  This key is required for reconfiguring the AI Application Gateway.
export API_GATEWAY_KEY="abcxyz"

# Metrics collection env variables

# Specify metrics collection interval in minutes
export API_GATEWAY_METRICS_CINTERVAL=60

# Specify the number of metrics collection buckets to save (in memory).
# For instance, the example below stores metrics for the past one week (24 * 7)
export API_GATEWAY_METRICS_CHISTORY=168

# (Optional) Set this value to Azure Application Insights resource connection string
export APPLICATIONINSIGHTS_CONNECTION_STRING=""

# (Optional) Global setting - Use cached retrieval? (true / false)
export API_GATEWAY_USE_CACHE="false"

# (Optional) Cache entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_CACHE_INVAL_SCHEDULE="*/5 * * * *"

# (Optional) Global setting - Use memory / state management? (true / false)
export API_GATEWAY_STATE_MGMT="false"

# (Optional) Memory entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_MEMORY_INVAL_SCHEDULE="*/5 * * * *"

# (Optional) Global setting - Persist prompts in a DB? (true / false)
export API_GATEWAY_PERSIST_PROMPTS="false"

# AI Application that exposes vectorization model
export API_GATEWAY_VECTOR_AIAPP="vectorizedata"

# Search engine - only pgvector is supported!
export API_GATEWAY_SRCH_ENGINE="Postgresql/pgvector"

# Vector DB host, port, name, uname and user pwd
export VECTOR_DB_NAME="aoaisvc"
export VECTOR_DB_HOST="db.postgres.database.azure.com"
export VECTOR_DB_USER="user01"
export VECTOR_DB_UPWD="semantic-cache"
export VECTOR_DB_PORT="5432"
