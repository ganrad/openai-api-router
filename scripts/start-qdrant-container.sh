docker run -p 6333:6333 -p 6334:6334 \
    -v "/home/azureuser/qdrant_storage:/qdrant/storage:z" \
    -d qdrant/qdrant
