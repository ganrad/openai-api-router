## Gateway Router/Load Balancer

It is important to understand how the Gateway's load balancer distributes incoming API requests among configured Azure OpenAI backends (model deployment endpoints). Please read below.

- The Gateway will use the configured API router to forward requests to the backend OpenAI (AI Service) endpoints.  Refer to Section **A** for details on supported router types. If no router type is configured for an AI Application, the gateway will use the default **Priority** based routing.  In this case, the Gateway will follow the priority order when forwarding requests to the configured OpenAI backends. Lower numeric values equate to higher priority. This implies, the gateway will forward requests to backends with priority of '0', '1' and then go in that order.  Priorities assigned to OpenAI backends can be viewed by invoking the *instanceinfo* endpoint - `/instanceinfo`.
- If a specific Azure OpenAI model deployment or Agent endpoint is throttled or unavailable, the Gateway will automatically forward the request to the next available endpoint. This process continues sequentially until all configured endpoints for the application have been attempted.   
- When a backend endpoint is busy or throttled (returns http status code = 429), the gateway will mark this endpoint as unavailable and **record** the 'retry-after' seconds value returned in the OpenAI API response header.  The gateway will not forward/proxy any more API requests to this backend until retry-after seconds has elapsed thereby ensuring the backend (OpenAI endpoint) doesn't get overloaded with too many requests.
- When all configured backend endpoints are busy or throttled (return http status code = 429), the gateway will return the **lowest** 'retry-after' seconds value returned by one of the *throttled* OpenAI backends. This value (in seconds) will be returned in the Gateway response header 'retry-after'.  Client applications should ideally wait the no. of seconds returned in the 'retry-after' response header before making a subsequent API call.
- For as long as all the backend endpoints are busy/throttled, the Gateway will perform global rate limiting and continue to return the **lowest** 'retry-after' seconds in it's response header ('retry-after').

## Semantic Caching and Retrieval

Cached completions are retrieved based on semantic text similarity algorithm and distance threshold configured for each AI Application.  Caching and retrieval of Azure OpenAI Service responses (completions) can be enabled at 3 levels. 

1. Global Setting

   To enable caching of OpenAI Service responses/completions, the environment variable *API_GATEWAY_USE_CACHE* must be set to "true".  If this variable is empty or not set, caching and retrieval of OpenAI Service completions (responses) will be disabled for all configured AI Applications.
2. AI Application

   To enable caching at AI Application level, the configuration attribute *cacheSettings.useCache* must be set to "true".  If this variable is empty or not set (or set to "false"), caching and retrieval of OpenAI Service completions (responses) will be disabled for the AI Application (only).
3. API Gateway (HTTP) Request

   Caching and retrieval of completions can be disabled for each individual API Gateway request by passing in a query parameter *use_cache* and setting its value to *false* (eg., `?use_cache=false`).  Setting this parameter value to "true" has no effect.

Prior to turning on *Semantic Caching* feature for an AI Application (in Production), please review the following notes.

- The semantic caching feature utilizes an Azure OpenAI *embedding* model to vectorize prompts.  Any of the three embedding models offered by Azure OpenAI Service can be used to vectorize/embedd prompt data.  The embedding models have a request token size limit of 8K and output dimension of 1536 tokens. This implies, any request payload containing more than 8K tokens (prompt) will likely be truncated and result in faulty search results.
- By default, *pgvector* extension performs exact nearest neighbor search which provides excellent recall. However, search performance is likely to take a hit (degrade) as the number of records in the table go above 1K. To trade some recall for query performance, its recommended to add an index and use approximate nearest neighbor search.  *pgvector* extension supports two index types - *HNSW* and *IVFFlat*.  Between the two, HNSW has better query performance. Refer to the snippet below to add an HNSW index to the *apigtwycache* table.  Use `psql` to add the index.
  ```bash
  # Create HNSW index for cosine similarity distance function.
  #
  => CREATE INDEX ON apigtwycache USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
  #
  # To use L2 distance, set the distance function to 'vector_l2_ops'. Similarly, for IP distance function use 'vector_ip_ops'.
  ```
- During functional tests, setting the cosine similarity score threshold to a higher value *> 0.95* was found to deliver more accurate search results. 
- The *Inner Product* distance function has not been thoroughly tested with sample data.  Prior to using this function, it is advised to run functional tests and verify results.

**Invalidating Cached Entries**

- When semantic caching and retrieval is enabled at the global level (*API_GATEWAY_USE_CACHE=true*), the Gateway periodically runs a cache entry invalidator process on a pre-configured schedule.  If no schedule is configured, the cache invalidator process is run on a default schedule every 45 minutes.  This default schedule can be overridden by setting the environment variable *API_GATEWAY_CACHE_INVAL_SCHEDULE* as described in Section **A** below.
- For each AI Application, cached entries can be invalidated (deleted) by setting the configuration attribute *cacheSettings.entryExpiry*. This attribute must be set to a value that conforms to PostgreSQL *Interval* data type. If this attribute value is empty or not set, cache entry invalidation will be skipped.  Refer to the documentation [here](https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-INTERVAL-INPUT) to configure the cache invalidation interval to an appropriate value.

## Conversational State Management

When interacting with AI Chatbots and information assistants, maintaining conversational continuity and context is crucial for generating accurate relevant responses to user's questions. Memory management for user sessions can be configured as follows.

1. Configure global setting

   To enable memory management at the API Gateway level, first set the environment variable *API_GATEWAY_STATE_MGMT* to "true".  If this env variable is empty or not set, memory (state) management will be disabled for all AI Applications.
2. Configure AI Application setting

   To enable memory management for an AI Application, the attribute *memorySettings.useMemory* must be set to "true" in the router configuration file.  If this attribute is empty or set to "false", memory management for user sessions will be disabled.

Prior to turning on *Conversational State Management* feature for an AI Application (in Production), please review the following notes.

- Conversational state management feature is only supported for Azure OpenAI Chat Completion API.
- When memory management is enabled for an AI application, the AI Application Gateway will return a custom http header `x-thread-id` in the API response.  This custom header will contain a unique value (GUID) representing a Thread ID.  To initiate a new user session and have the AI Application Gateway manage the conversational context, client applications must send this value in the http request header `x-thread-id`, in subsequent API calls.  The Thread ID represents an end user's session with an AI Chatbot/Assistant application.  A client application can end a user session at any time by not sending this custom http header in the API request.
- Use the *memorySettings.msgCount* attribute to specify the number of end user interactions (messages) to persist for each user session. Once the number of saved user interactions reaches this max. value (specified by this attribute), the memory manager component will discard the oldest message and only keep the most recent messages.  For each user session, the first user interaction (message) will always be retained by the memory manager.
- Use the *memorySettings.entryExpiry* attribute to specify the expiry time for user sessions.  After a user's session expires, API requests containing the expired Thread ID in the http header will receive an exception stating the session has expired.
- To quickly test the user session state management feature, you can use one of the provided standalone nodejs applications. See below.
  
  - A simple chat application that uses REST API calls - `./samples/chat-client/simple-chat-app.js`.
  - A chat application that uses Azure OpenAI SDK to make streaming API calls - `./samples/chat-client/stream-chat-app.js`

**Invalidating Memory Entries**

- When conversational state management feature is enabled at the global level (*API_GATEWAY_STATE_MGMT=true*), the AI Application Gateway periodically runs a memory invalidator process on a pre-configured Cron schedule.  If no schedule is configured, the memory invalidator process is run on a default schedule every 10 minutes.  This default schedule can be overridden by setting the environment variable *API_GATEWAY_MEMORY_INVAL_SCHEDULE* as described in Section **A** below.
- For each AI Application, memory entries can be invalidated (deleted) by setting the configuration attribute *memorySettings.entryExpiry*. This attribute must be set to a value that conforms to PostgreSQL *Interval* data type. If this attribute value is empty or not set, memory entry invalidation will be skipped.  Refer to the documentation [here](https://www.postgresql.org/docs/current/datatype-datetime.html#DATATYPE-INTERVAL-INPUT) to configure memory entry invalidation interval to an appropriate value.

## Persisting Prompts and Completions

- When global environment variable *API_GATEWAY_PERSIST_PROMPTS* is set to *true*, prompts and completions along with other API request related metadata will be persisted in database table *apigtwyprompts*.
- API Request *prompts* will not be persisted under the following conditions a) All backend endpoints for a given AI Application are busy/throttled.  In this case, the Gateway will return HTTP status code 429. b) API Gateway encounters an internal error while handling a request.  In this case, the Gateway will return HTTP status code 500.
- The Gateway returns a unique (GUID) id *x-request-id* in the HTTP response header for every request.  This header value along with the *user* value sent in the API request (body) can be used to query table *apigtwyprompts* and troubleshoot issues.  For instance, these values could be used to query a request that failed due to application of a content filter (HTTP status = 400).