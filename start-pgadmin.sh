# Run the pgAdmin container on port 8001 (host)
docker run -p 8001:80 \
  -e 'PGADMIN_DEFAULT_EMAIL=ganeshra@microsoft.com' \
  -e 'PGADMIN_DEFAULT_PASSWORD=Gbb-2024' \
  -e 'PGADMIN_LISTEN_ADDRESS=0.0.0.0' \
  -e 'PGADMIN_CONFIG_LOGIN_BANNER="Authorized users only!"' \
  -d \
  dpage/pgadmin4
