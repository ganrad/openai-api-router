export API_GATEWAY_CONFIG_FILE="./api-router-config.json"
export API_GATEWAY_NAME="Test-Gateway"
export API_GATEWAY_PORT=8000
export API_GATEWAY_ENV="dev"
export API_GATEWAY_LOG_LEVEL="info"

# Metrics collection env variables

# Collect metrics hourly
export API_GATEWAY_METRICS_CINTERVAL=60

# Store metrics for the past one week (24 * 7)
export API_GATEWAY_METRICS_CHISTORY=168
