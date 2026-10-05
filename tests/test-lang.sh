curl -X POST https://gr-dev-lang.cognitiveservices.azure.com/language/:analyze-text?api-version=2022-05-01 \
-H "Content-Type: application/json" \
-H "Ocp-Apim-Subscription-Key:d3aa1fa1fb844e428a984ed9a4c4c553" \
-d @ai-lang-ner.json | jq .

curl http://$1:$2/api/v1/dev/apirouter/lb/language-app -i \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-lang-ld.json

curl http://$1:$2/api/v1/dev/apirouter/lb/language-app -i \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-lang-ner.json

curl http://$1:$2/api/v1/dev/apirouter/lb/language-app -i \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-lang-kpe.json

curl http://$1:$2/api/v1/dev/apirouter/lb/language-app -i \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-lang-el.json

curl http://$1:$2/api/v1/dev/apirouter/lb/language-app -i \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-lang-sa.json

curl http://$1:$2/api/v1/dev/apirouter/lb/language-app -i \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-lang-piier.json
