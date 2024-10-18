# -------------------------------------------
# Reference implementation of a single page chat application (Frontend) that uses AI Services API Gateway Server as a backend.
#
# Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
# Date: 06-28-2024
#
# Description: This dockerfile builds the frontend ~ AI chat application (SPA).
#
# Nodejs provides a scalable runtime for serving the frontend chat application to clients (browser).
#
# NOTES:
# ID07302024: ganrad: Introduced client/user authentication.  This feature uses Microsoft Entra ID
# ----------------------------------------------------------------
#
FROM public.ecr.aws/docker/library/node:20.11.0-alpine3.19
LABEL name="Azure AI (frontend/client) Chat Application"
LABEL version="1.0.1"
LABEL description="This dockerfile is used to build a container image of the AI (frontend) chat application"
LABEL author="Ganesh Radhakrishnan" email="ganrad01@gmail.com" dated="06-28-2024" license="MIT"

# (Required) Frontend application configuration file
ARG config_file=./app-config.json
ENV FRONTEND_SRV_CONFIG_FILE=$config_file

# (Required) AI Application Gateway load balancer endpoint
ARG lb_endpoint=http://0.0.0.0:8080/api/v1/dev/apirouter/lb/
ENV AIS_API_GATEWAY_URI=$lb_endpoint

# (Optional) Frontend application server (Express) listening port
ARG listen_port=8000
ENV FRONTEND_SRV_PORT=$listen_port

# (Required) Secure the AI chat application using Microsoft Entra ID? // ID07302024.n
# IMPORTTANT: When running the container with auth enabled, make sure to set values for the following env vars.
# 1. AZURE_TENANT_ID  (Azure tenant ID)
# 2. FRONTEND_CLIENT_ID (This is the client/application ID of AI Chatbot Application registered in MSFT Entra)
# 3. API_GATEWAY_APP_ID (This is the Application ID of the AI Application Gateway registered in MSFT Entra)
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

EXPOSE $FRONTEND_SRV_PORT

CMD [ "npm", "start" ]
