/**
 * Name: CacheDao
 * Description: This class serves as a data access object (DAO) to the 
 * underlying cache (Semantic/Vector) DB's. Contains methods to 
 *   1) Query and retrieve cached entries and 
 *   2) Store entries in the cache store
 * 
 * The semantic cache is maintained at 3 levels/layers.  Levels 1 and 2 are optional and configurable for each AI Application.
 * 1) Level 1 (l1): In-memory (in-process) vector cache. Be cautious when using in-memory cache. Storing too many entries in-memory may result
 *    in memory out of bounds (insufficient) errors, affect runtime performance (due to similarity search) and cause instability issues. 
 *    Ensure the AI Gateway container or pod has been assigned enough compute resources. 
 * 2) Level 2 (l2): Qdrant low-latency high performance scalable vector cache
 * 3) Level 3 (pg): Robust & highly scalabe PostgreSQL vector cache (Default)
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-20-2024
 *
 * Notes:
 * ID04112024: ganrad: Match AI app name/id when selecting cached entries
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID11072024: ganrad: v2.1.0: (Optimize) Moved literal constants into 'app-gtwy-constants.js' file
 * ID11112024: ganrad: v2.1.0: (Enhancement) Added new field 'srv_name' to cache, memory, prompts and tools trace tables.  This field will allow
 * a) Each server instance to cleanly evict cache/memory entries independently of other instances within a replica set & b) Provide info. on which
 * server instance actually created a record in the respective DB table.
 * ID01292025: ganrad: v2.2.0: (Bugfix) Gracefully skip caching when embedding application and endpoints are not configured.
 * ID03052025: ganrad: v2.3.0: (Bugfix) Use MID auth for Azure AI Service(s) when it is enabled & configured for the runtime.
 * ID09032025: ganrad: v2.5.0: (Code refactoring) Optimized query to retrieve vectorized prompt.
 * ID09122025: ganrad: v2.5.0: (Enhancement) When querying the cache, search for a similar prompt in server instance(s) whose names start with the
 * server id and AI application id.
 * ID11212025: ganrad: v2.9.5: (Enhancement) Introduced in-memory (l1) and Qdrant (l2) levels/layers in semantic cache. Updated search type / algorithm
 * constants to a uniform set of values.
 *   
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const pgvector = require('pgvector/pg');
const helper = require("./helper-funcs");
const {
  generateUUID,
  OpenAIChatCompletionMsgRoleTypes,
  SearchAlgorithms,
  CacheSearchTerms,
  CacheLevels
} = require("./app-gtwy-constants"); // ID11072024.n, ID11212025.n
const crypto = require("node:crypto"); // ID11212025.n

const srchTypes = new Map([ // Vector search types; ID11212025.o: NOT USED/Deprecated!
  [SearchAlgorithms.EuclideanDistance, "<->"], // Euclidean or L2 distance ID11072024.n
  [SearchAlgorithms.InnerProduct, "<#>"], // Inner product
  [SearchAlgorithms.CosineSimilarity, "<=>"]  // (Default) Cosine similarity
]);

function constructQuery(strings, operator, srchDistance) { // Deprecated
  return `strings[0] ${operator} $1 < ${distance}`;
}

const queryStmts = [
  // "SELECT completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE 1 - (embedding <=> $1) > $2 ORDER BY embedding <=> $1 LIMIT $3", ID04112024.o
  // Cosine similarity search
  // "SELECT completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE (aiappname = $4) AND (1 - (embedding <=> $1) > $2) ORDER BY embedding <=> $1 LIMIT $3", // ID04112024.n, ID09032025.o
  "SELECT embedding, completion, 1 - (embedding <=> $1) as similarity FROM apigtwycache WHERE (srv_name LIKE $5 || '%') AND (aiappname = $4) AND 1 - (embedding <=> $1) >= $2 ORDER BY similarity DESC LIMIT $3", // ID09032025.n, ID09122025.n, ID11212025.n
  // "SELECT completion, embedding <-> $1 as similarity FROM apigtwycache WHERE embedding <-> $1 < $2 ORDER BY embedding <-> $1 LIMIT $3", ID04112024.o
  // Euclidean or L2 search
  "SELECT embedding, completion, embedding <-> $1 as similarity FROM apigtwycache WHERE (aiappname = $4) AND (embedding <-> $1 < $2) ORDER BY embedding <-> $1 LIMIT $3", // ID04112024.n, ID11212025.n
  "SELECT completion FROM apigtwycache ORDER BY embedding" // Requires an index!
];

const insertStmts = [
  // "INSERT INTO apigtwycache (requestid, aiappname, prompt, embedding, completion) VALUES ($1,$2,$3,$4,$5) RETURNING id" // ID11112024.o
  "INSERT INTO apigtwycache (requestid, srv_name, aiappname, prompt, embedding, completion) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id" // ID11112024.n
];

class CacheDao {
  constructor(
    epInfo,
    vectorEndpoints,
    sType,
    sDistance,
    sContent) {

    this.endPointInfo = epInfo;
    this.endpoints = vectorEndpoints;
    this.srchType = (sType) ? sType : SearchAlgorithms.Cosine; // SearchAlgorithms.CosineSimilarity; // Default ~ Cosine Similarity ID11072024.n, ID11212025.o
    this.srchDistance = (sDistance) ? sDistance : 0.6; // Default ~ 0.6
    this.srchTerm = (sContent) ? (sContent.term ? sContent.term : CacheSearchTerms.Prompt) : CacheSearchTerms.Prompt; // ID11212025.n
    if ((this.srchTerm !== CacheSearchTerms.Prompt) && (this.srchTerm !== CacheSearchTerms.Messages)) // ID11212025.n
      this.srchTerm = CacheSearchTerms.Prompt; // default search term
    // this.srchTermRoles = (this.srchTerm === "messages") ? (sContent.includeRoles ? sContent.includeRoles : "system,user,assistant") : null; ID11212025.o
    this.srchTermRoles = (this.srchTerm === CacheSearchTerms.Messages) ? (sContent.includeRoles ? sContent.includeRoles : OpenAIChatCompletionMsgRoleTypes.UserMessage) : null; // ID11212025.n

    // ID11212025.sn
    // IMP: To store encrypted messages in the vector store(s), a 32-bit base64 encoded key is required!
    // Encryption only applies to Qdrant vector store.
    let encryptionKeyB64 = arguments[5];

    // Option 2: Populate environment variable with the key - AI_GATEWAY_CACHE_AES_KEY_BASE64;
    // Command to generate AI_GATEWAY_CACHE_AES_KEY_BASE64:
    //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
    if (!encryptionKeyB64)
      encryptionKeyB64 = process.env.AI_GATEWAY_CACHE_AES_KEY_BASE64;

    if (encryptionKeyB64) {
      // Decode base64 -> 32 byte buffer
      // crypto.createCipheriv("aes-256-cbc", key, iv) requires key to be a 32-byte Buffer. Decoding the base64 string gives exactly that
      this.encryptionKey = Buffer.from(encryptionKeyB64, "base64");
      if (this.encryptionKey.length !== 32) {
        // throw new Error("AES-256-CBC requires a 32-byte key (after base64 decode).");
        this.encryptionKey = null;
      };
    };

    this.metricsStore = arguments[6]
    this.l1Cache = arguments[7];
    this.level2Config = arguments[8];
    // ID11212025.en
  }

  // ---------------------- Utilities ----------------------
  #cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  #makeKeyFromPrompt(prompt) { // Deprecated!
    return crypto.createHash("sha1").update(prompt).digest("hex");
  }

  // ---------------------- Encryption Helpers ----------------------
  #encryptPayload(obj) {
    const iv = crypto.randomBytes(16);// CBC requires 16 bytes
    // const cipher = crypto.createCipheriv("aes-256-cbc", this.encryptionKey, iv); 
    // CBC doesn't protect integrity. Use GCM instead
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(obj), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      data: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64")
    };
  }

  #decryptPayload(encryptedObj) {
    const iv = Buffer.from(encryptedObj.iv, "base64");
    const tag = Buffer.from(encryptedObj.tag, "base64");
    const ciphertext = Buffer.from(encryptedObj.data, "base64");

    // const decipher = crypto.createDecipheriv("aes-256-cbc", this.encryptionKey, iv);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return JSON.parse(plaintext.toString("utf8"));
  }

  // ---------------------- L1 Search ----------------------
  async #searchL1(reqid, appId, embedding, scoreThreshold = 0.9) {
    if (!this.l1Cache) {
      // Level 1 cache is not configured for this AI App

      return (null);
    }
    else
      scoreThreshold = this.srchDistance ?? scoreThreshold;

    const start = Date.now();
    let best = null, bestScore = -Infinity;
    for (const [, entry] of this.l1Cache.entries()) {
      try {
        // const entry = this.encryptionKey ? this.#decryptPayload(encrypted) : encrypted;
        const score = this.#cosineSimilarity(embedding, entry.embedding);
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        };
      }
      catch (err) {
        // Ignore malformed entries
        logger.log({ level: "warn", message: "[%s] %s.#searchL1():\n  Request ID: %s\n  Application ID: %s\n  Exception:\n%s", splat: [scriptName, this.constructor.name, reqid, appId, helper.formatException(err)] });
      };
    };

    this.metricsStore.recordLatency(CacheLevels.Level1, start);
    if (best && bestScore >= scoreThreshold) {

      // Check if the item exists AND update its recency without fetching the value
      const exists = this.l1Cache.has(best.key, { updateAgeOnGet: true });

      this.metricsStore.updateCacheHits(CacheLevels.Level1, bestScore);
      logger.log({ level: "info", message: "[%s] %s.#searchL1():\n  Request ID: %s\n  Application ID: %s\n  Cache Level: %s\n  Similarity Score: %d\n  Execution Time: %d", splat: [scriptName, this.constructor.name, reqid, appId, CacheLevels.Level1, bestScore, Date.now() - start] });

      return { entry: best, score: bestScore };
    }
    else
      this.metricsStore.updateCacheMisses(CacheLevels.Level1);

    return null;
  }

  // ---------------------- L2 (Qdrant) Search and Insert ----------------------
  async #searchL2(req, appId, embedding, scoreThreshold = 0.9) {
    if (!this.level2Config) {
      // Level 2 cache is not configured for this AI App

      return (null);
    };

    const start = Date.now();
    const cutoff = start - this.level2Config.timeToLiveInMs;
    const collectionName = helper.getL2CacheCollectionName(req.targeturis.serverId, appId);
    // const url = `${this.level2Config.qdrantUri}/collections/${collectionName}/points/search`; // Search API is deprecated
    const url = `${this.level2Config.qdrantUri}/collections/${collectionName}/points/query`;
    const body = {
      // vector: embedding, // deprecated
      query: embedding,
      limit: 1,
      with_payload: true,
      score_threshold: this.level2Config.searchDistance ?? scoreThreshold,
      filter: { must: [{ key: "ts", range: { gte: cutoff } }] }
    };

    const headers = { "Content-Type": "application/json" };
    if (this.level2Config.apikey) headers["api-key"] = this.level2Config.apikey;

    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!resp.ok) {
      // Do not throw; treat as miss
      logger.log({ level: "warn", message: "[%s] %s.#searchL2():\n  Request ID: %s\n  Collection Name: %s\n  Application ID: %s\n  Status: %s\n  Exception: %s", splat: [scriptName, this.constructor.name, req.id, collectionName, appId, resp.status, await resp.text().catch(() => "")] });

      this.metricsStore.recordLatency(CacheLevels.Level2, start);
      this.metricsStore.updateCacheMisses(CacheLevels.Level2);

      return null;
    };

    const data = await resp.json();
    // console.log(`*****\n${JSON.stringify(data,null,2)}\n*****`);
    this.metricsStore.recordLatency(CacheLevels.Level2, start);

    if (data.result && data.result.points.length > 0) {
      const payload = data.result.points[0].payload;
      if (payload && payload.entry) {
        try {
          const decrypted = this.encryptionKey ? this.#decryptPayload(payload.entry) : payload.entry;
          const score = data.result.points[0].score || 0;
          this.metricsStore.updateCacheHits(CacheLevels.Level2, score);

          logger.log({ level: "info", message: "[%s] %s.#searchL2():\n  Request ID: %s\n  Collection Name: %s\n  Application ID: %s\n  Cache Level: %s\n  Similarity Score: %d\n  Execution Time: %d", splat: [scriptName, this.constructor.name, req.id, collectionName, appId, CacheLevels.Level2, score, Date.now() - start] });

          return { entry: decrypted, score };
        }
        catch (err) {
          logger.log({ level: "warn", message: "[%s] %s.#searchL2():\n  Request ID: %s\n  Collection Name: %s\n  Application ID: %s\n  Exception:\n%s", splat: [scriptName, this.constructor.name, req.id, collectionName, appId, helper.formatException(err)] });
        };
      };
    };
    this.metricsStore.updateCacheMisses(CacheLevels.Level2);

    return null;
  }

  async #addToL2(reqId, srvId, appId, vector, payload) {
    const key = payload.key;

    // payload: { key, prompt, response }
    const entry = this.encryptionKey ? this.#encryptPayload(payload) : payload;
    const point = {
      id: key,
      vector,
      payload: {
        entry,
        ts: Date.now()
      }
    };

    const collectionName = helper.getL2CacheCollectionName(srvId, appId);
    const url = `${this.level2Config.qdrantUri}/collections/${collectionName}/points?wait=true`;

    const headers = { "Content-Type": "application/json" };
    if (this.level2Config.apikey) headers["api-key"] = this.level2Config.apikey;
    const resp = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ points: [point] }) });
    if (!resp.ok)
      logger.log({ level: "warn", message: "[%s] %s.#addToL2():  Encountered exception while trying to add a point in L2 cache.\n  Request ID: %s\n  Collection Name: %s\n  Status: %s\n  Exception: %s", splat: [scriptName, this.constructor.name, reqId, collectionName, resp.status, await resp.text().catch(() => "")] });
    else
      logger.log({ level: "debug", message: "[%s] %s.#addToL2(): Cached entry in L2 cache.\n  Request ID: %s\n  Collection Name: %s\n  Application ID: %s\n  Key: %s", splat: [scriptName, this.constructor.name, reqId, collectionName, appId, key] });
  }

  // ---------------------- Execute Search ----------------------
  // async queryVectorDB(rid, appId, reqBody, dbHandle) { ID03052025.o
  async queryVectorDB(req, appId, dbHandle) { // ID03052025.n
    let embedding = null;
    let rowno = 0;
    // let score = 0.0; ID11212025.o
    let data = null;

    let stTime = Date.now();
    try {
      // 0) Check if embedd model endpoints are available. If not exit function.
      if (!this.endpoints) // ID01292025.n
        return {
          rowCount: rowno,
          // simScore: score, ID11212025.o
          completion: data,
          embeddings: embedding
        };

      // 1) Pre-process query before vectorization
      let queryContent = helper.prepareTextToEmbedd(
        // rid, // ID03052025.o
        req.id, // ID03052025.n
        this.srchTerm,
        this.srchTermRoles,
        // reqBody); ID03052025.o
        req.body); // ID03052025.n

      // 2) Convert query to embedded vector using Azure OpenAI embedding model
      // let apiResp = await helper.callRestApi( ID03052025.o
      let apiResp = await helper.vectorizeQuery( // ID03052025.n
        // rid, ID03052025.n
        req, // ID0305205.n
        // reqBody.user, ID03052025.o
        this.endPointInfo,
        this.endpoints,
        queryContent);

      if (apiResp) { // Use the embedded vector to query against the Vector stores
        // 3.0) L1 Search ID11212025.n
        const l1Hit = await this.#searchL1(req.id, appId, apiResp.embedding);
        if (l1Hit)
          return {
            rowCount: 1,
            completion: l1Hit.entry.response,
            embeddings: apiResp.embedding
          };

        // Generate a key from the query/prompt
        const key = await generateUUID();

        // 3.1) L2 Search ID11212025.n
        const l2Hit = await this.#searchL2(req, appId, apiResp.embedding);
        if (l2Hit) {
          // Save retrieved completion in l1 cache
          const entry = { key, appId, prompt: req.body.messages, response: l2Hit.entry.response, embedding: apiResp.embedding }; // IMP: 'prompt' vector is saved!
          this.l1Cache.set(key, entry);

          return {
            rowCount: 1,
            completion: l2Hit.entry.response,
            embeddings: apiResp.embedding
          };
        };

        let query = "";
        // if (this.srchType === SearchAlgorithms.CosineSimilarity) // cosine similarity search ID11072024.n, ID11212025.o
        if (this.srchType === SearchAlgorithms.Cosine) // ID11212025.n
          query = queryStmts[0];
        // else if (this.srchType === SearchAlgorithms.EuclideanDistance) // L2 or Euclidean search ID11212025.o
        else if (this.srchType === SearchAlgorithms.Euclid) // ID11212025.n
          query = queryStmts[1];
        // else if (this.srchType === SearchAlgorithms.InnerProduct) // Inner product, set to cosine similarity ID11212025.o
        // query = queryStmts[0]; // Not supported / tested yet!
        else
          query = queryStmts[0]; // Default cosine similarity search

        // 3.2) L3 search: Execute vector query on PostgreSQL DB
        const start = Date.now(); // ID11212025.n
        const { rowCount, simScore, vectors, completion } =
          await dbHandle.executeQuery(
            // rid, ID03052025.o
            req.id, // ID03052025.n
            query,
            [
              pgvector.toSql(apiResp.embedding),
              this.srchDistance,
              1,
              appId, // ID04112024.n
              req.targeturis.serverId // ID09122025.n
            ]
          );

        // score = simScore, ID11212025.o
        rowno = rowCount,
          data = completion,
          embedding = apiResp.embedding;

        // ID11212025.sn
        this.metricsStore.recordLatency(CacheLevels.Level3, start);
        if (rowno === 1) { // PostgreSQL l3 Cache hit
          // Update cache metrics
          this.metricsStore.updateCacheHits(CacheLevels.Level3, simScore);

          if (this.l1Cache) {
            // Save retrieved completion in l1 cache
            const entry = { key, appId, prompt: req.body.messages, response: completion, embedding: apiResp.embedding }; // IMP: 'prompt' vector is saved, vector retrieved from pg cache is not!
            this.l1Cache.set(key, entry);
          };

          if (this.level2Config) {
            // Save retrieved completion in l2 cache
            const entry = { key, prompt: req.body.messages, response: completion };
            await this.#addToL2(req.id, req.targeturis.serverId, appId, apiResp.embedding, entry); // IMP: 'prompt' vector is saved, vector retrieved from pg cache is not!
          }
        }
        else
          this.metricsStore.updateCacheMisses(CacheLevels.Level3);
        // ID11212025.en
      };

      // console.log(`${this.constructor.name}.queryVectorDB():\n  Application ID: ${appId}\n  Request ID: ${rid}\n  User: ${reqBody.user}\n  Execution Time: ${Date.now() - stTime}\n*****`);
      logger.log({
        level: "info", message: "[%s] %s.queryVectorDB():\n  Request ID: %s\n  Application ID: %s\n  User: %s\n  Execution Time: %d\n  Items in L1 cache: %d\n  Total size of items in L1 cache (Bytes): %d",
        splat: [scriptName, this.constructor.name, req.id, appId, req.body.user, Date.now() - stTime, (this.l1Cache ? this.l1Cache.size : 0), (this.l1Cache ? this.l1Cache.calculatedSize : 0)]
      }); // ID03052025.n, ID11212025.n
    }
    catch (error) {
      let err_msg = { reqId: req.id, appId: appId, body: req.body, error: { name: error.name, message: error.message, stackTrace: error.stack } }; // ID03052025.n, ID11212025.n
      // console.log({level: "error", message: "[%s] %s.queryVectorDB():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
      logger.log({ level: "error", message: "[%s] %s.queryVectorDB():\n  Encountered exception:\n%s", splat: [scriptName, this.constructor.name, JSON.stringify(err_msg, null, 2)] });
    };

    return {
      rowCount: rowno,
      // simScore: score, ID11212025.o
      completion: data,
      embeddings: embedding
    };
  }

  // ---------------------- Store/Cache embedding + completion ----------------------
  async storeEntity(qidx, values, dbHandle) {
    let stTime = Date.now();

    // ID11212025.sn
    let prompt = null;
    let emb = null;
    let modelResponse = null;
    const updatedValues = values.filter((_, idx) => idx !== 6).map((value, index) => { // Skip 'serverId' ~ values[6]
      if (index === 3) // prompt
        prompt = JSON.parse(value);

      if (index === 4) { // embedding
        emb = value;

        return (pgvector.toSql(emb));
      };

      if (index === 5) // model response/completion
        modelResponse = value;

      return (value);
    });
    // ID11212025.en

    // await dbHandle.insertData(insertStmts[qidx], values); ID11212025.o
    // Save model completion in l3 cache
    await dbHandle.insertData(insertStmts[qidx], updatedValues); // ID11212025.n

    // ID11212025.sn
    try {
      let key;
      if (this.l1Cache) {
        // Generate a key from the query/prompt
        key = await generateUUID();

        // Save model completion in l1 cache
        const entry = { key, appId: values[2], prompt, response: modelResponse, embedding: emb };
        this.l1Cache.set(key, entry);
      };

      if (this.level2Config) {
        // Generate a key from the query/prompt
        if (!key)
          key = await generateUUID();

        // Save model completion in l2 cache
        const entry = { key, prompt, response: modelResponse };
        await this.#addToL2(values[0], values[6], values[2], emb, entry);
      };

      logger.log({
        level: "info", message: "[%s] %s.storeEntity():\n  Request ID: %s\n  Application ID: %s\n  Execution Time: %d\n  Items in L1 cache: %d\n  Total size of items in L1 cache (Bytes): %d",
        splat: [scriptName, this.constructor.name, values[0], values[2], Date.now() - stTime, (this.l1Cache ? this.l1Cache.size : 0), (this.l1Cache ? this.l1Cache.calculatedSize : 0)]
      });
    }
    catch (error) {
      const errorDetails = `    Name: ${error.name}\n    Message: ${error.message}\n    Stack Trace: ${error.stack}`;
      logger.log({ level: "error", message: "[%s] %s.storeEntity():\n  Request ID: %s\n  Application ID: %s\n  Encountered exception:\n%s", splat: [scriptName, this.constructor.name, values[0], values[2], errorDetails] });
    };
    // ID11212025.en
  }
}

module.exports = CacheDao;