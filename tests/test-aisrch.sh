curl https://gr-dev-rag-ais.search.windows.net/indexes/ak-stip-v2/docs/search?api-version=2023-11-01 \
   -X POST \
   -H "Content-Type: application/json" \
   -H "api-key: CyMRW4Ei4bSgVahEVxV3PJyXN3vh361rYYblOes2YrAzSeD5lrSL" \
   --data @ai-srch-stip-text.json | jq .

curl https://gr-dev-rag-ais.search.windows.net/indexes/ak-stip-v2/docs/search?api-version=2023-11-01 \
   -X POST \
   -H "Content-Type: application/json" \
   -H "api-key: CyMRW4Ei4bSgVahEVxV3PJyXN3vh361rYYblOes2YrAzSeD5lrSL" \
   --data @ai-srch-stip-semantic.json | jq .
