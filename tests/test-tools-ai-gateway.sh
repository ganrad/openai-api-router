# curl https://oai-gr-test.openai.azure.com/openai/deployments/test-gpt35-turbo-instruct/completions?api-version=2023-05-15 \
# -H "api-key: 9eca9ec" \

i=0
c_bool=1
while [ $i -le 2000 ]
do
  PARAM=$([ $c_bool -eq 1 ] && echo "" || echo "?use_cache=false")
  targetUri="http://$1:$2/api/v1/test/aigateway/lb/ai-multi-domain-agent$PARAM"

  curl $targetUri -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Get me the details for customer 'ava' Is there any outage in their area?  Get me the customer's billing info. as well.\"}], \"model\": \"gpt-5.2-global\", \"max_completion_tokens\": 1000}" | jq .
  # curl $targetUri -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"Get me the health benefits information for subscriber with ID: SUB12345 and Member ID: M1000001.  Use date of service as today.\"}], \"model\": \"gpt-5.2-global\", \"max_completion_tokens\": 1000}" | jq .
  curl $targetUri -H "Content-Type: application/json" -d "{\"messages\": [{\"role\": \"user\", \"content\": \"For order SO-10045, can we deliver to 98109 by Oct 5th? If yes, pick the cheapest carrier that meets the date and create a shipment plan.\"}], \"model\": \"gpt-5.2-global\", \"max_completion_tokens\": 1000}" | jq .
  ((i++))

  # Toggle the boolean variable (1 becomes 0, 0 becomes 1)
  c_bool=$((1 - c_bool))
  sleep 1
done
