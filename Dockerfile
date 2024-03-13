# -------------------------------------------
# Azure OpenAI Service API Gateway server 
#
# Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
# Date: 01-28-2024
#
# Description: This dockerfile builds the API Gateway Server container image.
# The API Gateway server can be used for two purposes.
# 1) Capacity planning for PTUs (Provisioned throughput units). 
# Track & collect metrics for Azure OpenAI API usage. Use metrics to assist with
# capacity planning.
# 2) Scale Azure OpenAI Service model deployments.
# Load balance API requests among multiple Azure OpenAI service model 
# deployments.
#
# Nodejs provides a scalable API server which can easily be configured
# to scale and support 10s ... 1000's of concurrent API requests/connections.
#
# NOTES:
# ----------------------------------------------------------------
#
FROM public.ecr.aws/docker/library/node:20.11.0-alpine3.19
LABEL name="Azure OpenAI Service API Gateway server"
LABEL version="1.0"
LABEL description="This container image exposes endpoints to 1) Track API usage for capacity planning 2) Load balancing API requests across multiple Azure OpenAI model deployments"
LABEL author="Ganesh Radhakrishnan" email="ganrad01@gmail.com" dated="01-28-2024" license="MIT"

# (Required) API Gateway config file
ARG config_file=./api-router-config.json
ENV API_GATEWAY_CONFIG_FILE=$config_file

# (Required) API Gateway secret key.
# IMPORTANT: Change this value before building the image!!
ENV API_GATEWAY_KEY="abcxyz"

# (Required) API Gateway name
ARG gateway_name=Test-Gateway
ENV API_GATEWAY_NAME=$gateway_name

# (Optional) API Gateway listening port
ARG listen_port=8000
ENV API_GATEWAY_PORT=$listen_port

# (Required) API Gateway env.  Any string - dev, test, prod ...
ARG gateway_env=dev
ENV API_GATEWAY_ENV=$gateway_env

# (Optional) API Gateway logging level - debug, info, warn, error, fatal
ARG gateway_log_level=info
ENV API_GATEWAY_LOG_LEVEL=$gateway_log_level

# (Required) API Gateway metrics collection interval (in minutes)
ARG metrics_interval=5
ENV API_GATEWAY_METRICS_CINTERVAL=$metrics_interval

# (Required) API Gateway metrics history cache count
ARG metrics_history=5
ENV API_GATEWAY_METRICS_CHISTORY=$metrics_history

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
RUN mkdir -p /home/node/app/src

WORKDIR /home/node/app

COPY package.json ./

USER node

RUN npm install

COPY --chown=node:node . .

RUN ls -lt

EXPOSE $API_GATEWAY_PORT

CMD [ "npm", "start" ]
