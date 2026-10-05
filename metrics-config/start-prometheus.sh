docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro \
  --add-host=host.docker.internal:host-gateway \
  prom/prometheus:latest
