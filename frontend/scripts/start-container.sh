docker run -e FRONTEND_SRV_HOST='0.0.0.0' -e AIS_API_GATEWAY_URI='http://4.242.16.181:8080/api/v1/dev/apirouter/lb/' --name ais-chat-app-dev -p 8000:8000 ais-chat-app
