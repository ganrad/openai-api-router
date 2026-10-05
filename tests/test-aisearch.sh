echo "--------------------------------------------"
echo "***** AI Search API *****"
echo "--------------------------------------------"
curl -i https://gr-dev-rag-ais.search.windows.net/indexes/ak-stip-v2/docs/search?api-version=2023-11-01 \
   -X POST \
   -H "Content-Type: application/json" \
   -H "api-key: CyMRW4Ei4bSgVahEVxV3PJyXN3vh361rYYblOes2YrAzSeD5lrSL" \
   --data @ai-srch-stip-text.json

# 1. Simple text search
echo "--------------------------------------------"
echo "***** Simple Text Search API *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-v2" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-text.json | jq .
 
# 2. Vector search
echo "--------------------------------------------"
echo "***** Vector Search API *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-v2" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-vector.json | jq .

# 3. Hybrid search - Keyword/text + Vector
echo "--------------------------------------------"
echo "***** Hybrid Search API (Keyword + Vector) *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-v2" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-text-vector.json | jq .

# 4. Simple text with semantic search
echo "--------------------------------------------"
echo "***** Text + Semantic Search API *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-v2" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-semantic.json | jq .

# 5. Hybrid (text + vector) with semantic search
echo "--------------------------------------------"
echo "***** Hybrid Search (Keyword + Vector) + Semantic API *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-v2" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-hybrid-semantic.json | jq .

# 6. Simple vector search - integrated vectorization
echo "--------------------------------------------"
echo "***** Vector Search API IV *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-aisrch-iv" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-iv.json | jq .

# 7. Text + vector search - integrated vectorization
echo "--------------------------------------------"
echo "***** Text + vector Search API IV *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-aisrch-iv" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-text-iv.json | jq .

# 8. Hybrid search (keyword + vector) with semantic ranking (relevance score) - integrated vectorization
echo "--------------------------------------------"
echo "***** Text + Vector + Semantic Search API IV *****"
echo "--------------------------------------------"
curl "http://$1:$2/api/v1/dev/apirouter/lb/search-app-ak-stip-aisrch-iv" \
   -X POST \
   -H "Content-Type: application/json" \
   -d @ai-srch-stip-hybrid-sem-iv.json | jq .
