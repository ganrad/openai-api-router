export API_GATEWAY_CONFIG_FILE="./api-router-config.json"
export API_GATEWAY_NAME="Gateway-Instance-01"
export API_GATEWAY_PORT=8000
export API_GATEWAY_ENV="dev"
export API_GATEWAY_LOG_LEVEL="info"

# API Gateway Key
export API_GATEWAY_KEY="abcxyz"

# Metrics collection env variables

# Specify metrics collection interval in minutes
export API_GATEWAY_METRICS_CINTERVAL=60

# Specify the number of metrics collection buckets to save (in memory).
# For instance, the example below stores metrics for the past one week (24 * 7)
export API_GATEWAY_METRICS_CHISTORY=168

# (Optional) Set this value to Azure Application Insights resource connection string
export APPLICATIONINSIGHTS_CONNECTION_STRING=""

# (Optional) Global setting - Use cached retrieval?
export API_GATEWAY_USE_CACHE="true"

# (Optional) Cache entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_CACHE_INVAL_SCHEDULE="*/45 * * * *"

# (Optional) Global setting - Use memory / state management?
export API_GATEWAY_STATE_MGMT="true"

# (Optional) Memory entry invalidator run schedule (Cron schedule syntax)
export API_GATEWAY_MEMORY_INVAL_SCHEDULE="*/10 * * * *"

# (Optional) Global setting - Persist prompts in a DB?
export API_GATEWAY_PERSIST_PROMPTS="true"

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
