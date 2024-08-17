# -------------------------------------------
# Azure AI Application Gateway / Server 
#
# Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
# Date: 01-28-2024
#
# Description: This dockerfile builds the AI Application Gateway (Server) container image.
# The AI Application Gateway delivers value add features that help accelerate the 
# the development and deployment of AI Chatbots at scale.
#
# Nodejs runtime provides a scalable API server which can easily be configured
# to scale and support 10s ... 1000's of concurrent API requests/connections.
#
# NOTES:
# ID03152024 : ganrad : Added ARG and ENV variables for semantic caching
# ID05062024 : ganrad : Added ARG and ENV variables for state management
# ID07292024 : ganrad : Added ARG and ENV variables for securing the AI Gateway using MSFT Entra ID
# ----------------------------------------------------------------
#
FROM public.ecr.aws/docker/library/node:20.11.0-alpine3.19
LABEL name="Azure AI Application Gateway server"
LABEL version="2.0.0"
LABEL description="This container image exposes endpoints to 1) Track API usage for capacity planning (Azure OAI Service) 2) Load balancing AI Application requests across multiple Azure AI Services deployments/endpoints + many more value add features"
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

# (Required) Use Semantic Cache feature? // ID03152024.n
ARG use_cache="false"
ENV API_GATEWAY_USE_CACHE=$use_cache

# (Required) Use Conversational State Management? // ID05062024.n
ARG use_memory="false"
ENV API_GATEWAY_STATE_MGMT=$use_memory

# (Required) Secure the AI App Gateway with Microsoft Entra ID? // ID07292024.n
# IMPORTTANT: When running the container, make sure to set values for the following env vars.
# 1. AZURE_TENANT_ID  (Azure tenant ID)
# 2. API_GATEWAY_CLIENT_ID (This is the client/application ID of AI App Gateway registered in MSFT Entra)
ARG use_auth="true"
ENV API_GATEWAY_AUTH=$use_auth

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
