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
# ID05122026: ganrad: v3.0.1: Updated base image
# ID05182026: ganrad: v3.0.1: API_GATEWAY_TYPE is no longer mandatory. Defaults to 'single-domain'.
# ----------------------------------------------------------------
#

FROM node:20-alpine

LABEL name="Azure AI Application Gateway server"
LABEL version="3.0.1"
LABEL description="This container image exposes the Azure AI Application Gateway endpoints"
LABEL author="Ganesh Radhakrishnan" email="ganrad01@gmail.com" dated="01-28-2024" license="MIT"

# ------------------ CONFIG ------------------

ARG config_file=./api-router-config.json
ENV API_GATEWAY_CONFIG_FILE=$config_file

ENV API_GATEWAY_KEY="abcxyz"

ARG gateway_name=local-ai-gateway-2.3.8
ENV API_GATEWAY_ID=$gateway_name

ARG gateway_type=single-domain
ENV API_GATEWAY_TYPE=$gateway_type

ARG listen_port=8000
ENV API_GATEWAY_PORT=$listen_port

ARG gateway_env=dev
ENV API_GATEWAY_ENV=$gateway_env

ARG gateway_log_level=info
ENV API_GATEWAY_LOG_LEVEL=$gateway_log_level

ARG metrics_interval=60
ENV API_GATEWAY_METRICS_CINTERVAL=$metrics_interval

ARG metrics_history=168
ENV API_GATEWAY_METRICS_CHISTORY=$metrics_history

ARG use_cache="true"
ENV API_GATEWAY_USE_CACHE=$use_cache

ARG use_memory="true"
ENV API_GATEWAY_STATE_MGMT=$use_memory

ARG persist_prompts="true"
ENV API_GATEWAY_PERSIST_PROMPTS=$persist_prompts

ARG use_auth="true"
ENV API_GATEWAY_AUTH=$use_auth

# ------------------ APP SETUP ------------------

RUN mkdir -p /home/node/app/node_modules \
    && chown -R node:node /home/node/app

WORKDIR /home/node/app

# Copy only dependency manifests first (better caching)
COPY package.json package-lock.json* ./

USER node

# Install + audit fix vulnerabilities
RUN npm install --omit=dev && npm dedupe && npm audit --omit=dev || true

# Validate OTel dependency drift (Can be commented out!)
RUN npm ls @opentelemetry/sdk-trace-base

# Copy source
COPY --chown=node:node . .

RUN ls -lt

EXPOSE $API_GATEWAY_PORT

CMD [ "npm", "start" ]