docker run -d \
  --name grafana \
  -p 3000:3000 \
  -v $(pwd)/grafana/provisioning:/etc/grafana/provisioning \
  -v $(pwd)/grafana/dashboards:/var/lib/grafana/dashboards \
  --add-host=host.docker.internal:host-gateway \
  grafana/grafana:latest
