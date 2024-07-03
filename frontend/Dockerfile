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
# ----------------------------------------------------------------
#
FROM public.ecr.aws/docker/library/node:20.11.0-alpine3.19
LABEL name="Azure AI Services API Gateway server"
LABEL version="1.0.0"
LABEL description="This dockerfile is used to build a container image of the AI (frontend) chat application"
LABEL author="Ganesh Radhakrishnan" email="ganrad01@gmail.com" dated="06-28-2024" license="MIT"

# (Required) Frontend application configuration file
ARG config_file=./app-config.json
ENV FRONTEND_SRV_CONFIG_FILE=$config_file

# (Required) AI Services API Gateway load balancer endpoint
ARG lb_endpoint=http://0.0.0.0:8080/api/v1/dev/apirouter/lb/
ENV AIS_API_GATEWAY_URI=$lb_endpoint

# (Optional) Frontend application server (Express) listening port
ARG listen_port=8000
ENV FRONTEND_SRV_PORT=$listen_port

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
RUN mkdir -p /home/node/app/src

WORKDIR /home/node/app

COPY package.json ./

USER node

RUN npm install

COPY --chown=node:node . .

RUN ls -lt

EXPOSE $AOAI_FRONTEND_PORT

CMD [ "npm", "start" ]
