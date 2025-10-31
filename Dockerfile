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
# ID03152024: ganrad: Added ARG and ENV variables for semantic caching
# ID05062024: ganrad: Added ARG and ENV variables for state management
# ID07292024: ganrad: Added ARG and ENV variables for securing the AI Gateway using MSFT Entra ID
# ID09032024: ganrad: v2.0.1: AI Application Gateway name is now included in the configuration file
# ID11142024: ganrad: v2.1.0: Added ARG and ENV variable for persisting prompts and completions.
# ID09042024: ganrad: v2.1.0: Introduced multi domain AI App Engine (Distributed server).
# ----------------------------------------------------------------
#
FROM public.ecr.aws/docker/library/node:20.11.0-alpine3.19
LABEL name="Azure AI Application Gateway server"
LABEL version="2.8.5"
LABEL description="This container image exposes the Azure AI Application Gateway endpoints"
LABEL author="Ganesh Radhakrishnan" email="ganrad01@gmail.com" dated="01-28-2024" license="MIT"

# (Optional) API Gateway config file. If this env is not set, SQL DB config. provider will be used.
ARG config_file=./api-router-config.json
ENV API_GATEWAY_CONFIG_FILE=$config_file

# (Required) API Gateway secret key.
# IMPORTANT: Change this value before building the image!!
ENV API_GATEWAY_KEY="abcxyz"

# (Required) API Gateway ID
ARG gateway_name=local-ai-gateway-2.3.8
ENV API_GATEWAY_ID=$gateway_name

# (Required) API Gateway type - single-domain / multi-domain ID09042024.n
ARG gateway_type=single-domain
ENV API_GATEWAY_TYPE=$gateway_type

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
ARG metrics_interval=60
ENV API_GATEWAY_METRICS_CINTERVAL=$metrics_interval

# (Required) API Gateway metrics history cache count
ARG metrics_history=168
ENV API_GATEWAY_METRICS_CHISTORY=$metrics_history

# (Required) Use Semantic Cache feature? // ID03152024.n
ARG use_cache="true"
ENV API_GATEWAY_USE_CACHE=$use_cache

# (Required) Use Conversational State Management? // ID05062024.n
ARG use_memory="true"
ENV API_GATEWAY_STATE_MGMT=$use_memory

# (Optional) Persist prompts and completions? // ID11142024.n
ARG persist_prompts="true"
ENV API_GATEWAY_PERSIST_PROMPTS=$persist_prompts

# (Required) Secure the AI App Gateway with Microsoft Entra ID ("true" == yes; "false" == no)? // ID07292024.n
# IMPORTANT: When running the container with use_auth="true", make sure to set values for the following env vars.
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
