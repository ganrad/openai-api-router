curl -X POST "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=de" \
-H "Content-Type: application/json" \
-H "Ocp-Apim-Subscription-Key: 644b68dc63744859841fdedb70f1f68c" \
-H "Ocp-Apim-Subscription-Region: westus2" \
-d @ai-translate-trans.json | jq .

curl "http://$1:$2/api/v1/dev/apirouter/lb/translate-app?kind=translate&api-version=3.0&to=es" -i \
   -X POST \
   -H "Content-Type: application/json" \
   -H "Ocp-Apim-Subscription-Region: westus2" \
   -d @ai-translate-trans.json

