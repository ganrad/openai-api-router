/**
 * Name: Azure OAI processor
 * Description: This class implements a processor for executing Azure Open AI API requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 * ID04272024: ganrad: Switched to centralized logging with winstonjs
 * ID05062024: ganrad: Introduced memory feature (state management) for appType = Azure OpenAI Service
 * ID05282024: ganrad: (Bugfix) Reset the 'retryAfter' value when the request is served with an available endpoint.
 * ID05312024: ganrad: (Bugfix) Save only the message content retrieved from cache in memory for a new thread.
 * ID06052024: ganrad: (Enhancement) Added streaming support for Azure OpenAI Chat Completion API call(s).
 * ID06132024: ganrad: (Enhancement) Adapted gateway error messages to be compliant with AOAI Service error messages.
 * ID07292024: ganrad: (Minor update) Print authenticated user name along with the request.
 * ID09242024: ganrad: (Bugfix) Resolved JSON.parse error in streaming mode. Simplified streaming logic to improve performance
 * and readability.
 * ID10302024: ganrad: v2.1.0: (Enhancement) Support MSFT Entra ID auth (managed identity) for Azure OAI API calls (In addition
 * to supporting API Keys).
 * ID11052024: ganrad: v2.1.0: (Enhancement) Added support for LLMs which use Azure AI Model Inference API (Chat completion).
 * ID11062024: ganrad: v2.1.0: (Bugfix) Capture AI Model Inference API 422's.
 * ID11082024: ganrad: v2.1.0: (Enhancement) Added new field 'exec_time_secs' (~ execution time) to the 'apigtwyprompts' table.
 * ID11112024: ganrad: v2.1.0: Introduced instanceName (server ID + '-' + Pod Name) field.  Instance name will be stored along with cache, memory & prompt 
 * records. This will allow cache and memory invalidators associated with an instance to only operate on records created by self. 
 * Users can also easily identify which server instance served a request.  This feature is important when multiple server instances are deployed
 * on a container platform ~ Kubernetes.
 * ID11152024: ganrad: v2.1.0: (Bugfix)  Both API Gateway Entra ID Auth + AOAI MID Auth should not be used together!  Only one of them can be used.
 * ID02112025: ganrad: v2.2.0: (Enhancement) Store AOAI API response headers in 'apigtwyprompts' table.
 * ID02142025: ganrad: v2.2.0: (Enhancement) Store user session (thread ID) in 'apigtwyprompts' table.
 * ID02152025: ganrad: v2.2.0: (Enhancement) For streamed API calls, include token usage info. before persisting the request in 
 * 'apigtwyprompts' table.
 * ID02212025: ganrad: v2.2.1: (Experimental: To do) Count tokens in request body and skip caching the request + response if token size is greater than 8192.
 * This is the max input token limit for AOAI embedding model(s).
 * ID03052025: ganrad: v2.3.0: (Enhancement) Introduced support for using RAPID host's system MID for authenticating against Azure AI Service(s).
 * Restructured code.
 * ID03142025: ganrad: v2.3.0: (Error-proofing ~ poka-yoke) Disable caching for AOAI Chat Completion API function calls.
 * ID03262025: ganrad: v2.3.1: (Bugfix) a) Do a case insensitive match for authorization http header. b) Log the backend uri index when
 * an exception is encountered.
 * ID04302025: ganrad: v2.3.2: (Enhancement) When state mgmt is enabled for an AI App, track no. of user sessions/threads in metrics 
 * collection interval.
 * ID05082025: ganrad: v2.3.5: (Enhancement) When memory is turned on for an AI App, session affinity to backend URI can be enabled using a boolean
 * flag ~ memorySettings.affinity.
 * ID05142025: ganrad: v2.3.8: (Enhancement) Introduced user personalization feature ~ Long term memory.
 * ID06162025: ganrad: v2.3.9: (Enhancements) Listed below.
 *   1) When session affinity or weighted routing is enabled, retry all endpoints before returning.
 *   2) Introduced weighted random routing based on pre-defined endpoint weights.
 *   3) Extension of #2: Dynamically adjust the endpoint weights based on latency/response times of backend endpoints.
 *   4) Introduced Least Recently Used (LRU) and Least Connections Used (LCU) endpoint routers.
 *   5) Updated auth header to support OpenAI API calls.
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger.js');

// const fetch = require("node-fetch"); // ID06052024.o

const CacheDao = require("../utilities/cache-dao.js"); // ID02202024.n
const cachedb = require("../services/cp-pg.js"); // ID02202024.n
const { TblNames, PersistDao } = require("../utilities/persist-dao.js"); // ID03012024.n
const persistdb = require("../services/pp-pg.js"); // ID03012024.n
const UserMemDao = require("../utilities/user-mem-dao.js"); // ID05142025.n
const pgvector = require("pgvector/pg"); // ID02202024.n
const { 
  DefEmbeddingModelTokenLimit, 
  CustomRequestHeaders, 
  AzAiServices, 
  EndpointRouterTypes, // ID06162025.n
  OpenAIBaseUri // ID06162025.n
} = require("../utilities/app-gtwy-constants.js"); // ID05062024.n; ID06162025.n
const { randomUUID } = require('node:crypto'); // ID05062024.n

const { encode } = require('gpt-tokenizer'); // ID02212025.n
const { getAccessToken } = require("../auth/bootstrap-auth.js"); // ID03052025.n
const { getExtractionPrompt, updateSystemMessage, storeUserFacts } = require("../utilities/lt-mem-manager.js"); // ID05142025.n
const { callAiAppEndpoint } = require("../utilities/helper-funcs.js"); // ID05142025.n

class AzOaiProcessor {

  constructor() {
  }

  #tokensWithinLimit(req) { // ID02212025.n
    const msgs = req.body.messages;

    const nameTokens = 1;
    const msgTokens = 3;

    let tokens = 5;
    let elemTokens = 0;
    for (const element of msgs) {
      tokens += msgTokens;
      elemTokens = encode(element.content).length;
      // console.log(`*** role: ${element.role}, content: ${element.content}, tokens: ${elemTokens} ***`);

      // Encode the text to get the tokens
      tokens += elemTokens;
      if (element.name)
        tokens += nameTokens;
    };

    const retVal = (tokens > DefEmbeddingModelTokenLimit) ? false : true;
    logger.log({ level: "info", message: "[%s] %s.#tokensWithinLimit():\n  Request ID: %s\n  Token Count: %s", splat: [scriptName, this.constructor.name, req.id, tokens] });

    return (retVal);
  }

  #checkAndPruneCtxMsgs(count, msgs) {
    let aCount = 3 + (count * 2);

    let mLength = msgs.length;

    if (mLength > aCount)
      msgs.splice(3, 2); // 1) Keep the original 3 messages => role = system + user and assistant & 2) Delete the next 2 messages (role=user + assistant)

    return (msgs)
  }

  // ID06052024.sn
  * #chunkToLines(chunked_data) {
    let previous = "";

    for (const chunk of chunked_data) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      previous += bufferChunk;

      let eolIndex;
      while ((eolIndex = previous.indexOf("\n")) >= 0) {
        // line includes the EOL
        const line = previous.slice(0, eolIndex + 1).trimEnd();
        if (line === "data: [DONE]") break;
        // if (line.startsWith("data: ")) yield line;
        if (line) yield line;
        previous = previous.slice(eolIndex + 1);
      }
    };
    if (previous.startsWith("data: ")) yield previous;
  }

  * #linesToMessages(linesAsync) {
    let message;
    for (const line of linesAsync) {
      if (line.startsWith("data: "))
        message = line.substring("data: ".length);
      else
        message = line;

      yield message;
    }
  }

  * #processChunk(data, pline) {
    yield* this.#linesToMessages(this.#chunkToLines(data));
  }

  #constructCompletionMessage(completion, citations, metadata) {
    let completionObj = null;

    if (citations) {
      const citsObj = JSON.parse(citations);
      completionObj = {
        id: metadata.id,
        object: metadata.object,
        created: metadata.created,
        model: metadata.model,
        choices: [
          {
            message: {
              role: "assistant",
              content: completion,
              context: {
                citations: citsObj.choices[0].delta.context.citations,
                intent: citsObj.choices[0].delta.context.intent,
                all_retrieved_documents: citsObj.choices[0].delta.context.all_retrieved_documents
              }
            },
            finish_reason: "stop",
            index: 0
          }
        ],
        system_fingerprint: metadata.system_fingerprint
      };
    }
    else {
      completionObj = {
        id: metadata.id,
        object: metadata.object,
        created: metadata.created,
        model: metadata.model,
        choices: [
          {
            message: {
              role: "assistant",
              content: completion,
            },
            finish_reason: "stop",
            index: 0
          }
        ],
        system_fingerprint: metadata.system_fingerprint
      };
      if (metadata.usage) // ID02152025.n
        completionObj.usage = metadata.usage;
    };

    return (completionObj);
  }

  #constructCompletionStreamMessage(completion) {
    let completionObj = {
      choices: [
        {
          index: 0,
          delta: {
            content: completion.choices[0].message.content
          },
          finish_reason: null
        }
      ],
      created: completion.created,
      id: completion.id,
      model: completion.model,
      object: completion.object,
      system_fingerprint: completion.system_fingerprint
    };

    let citationsObj = null;
    if (completion.choices[0].message?.context) {
      citationsObj = {
        id: completion.id,
        created: completion.created,
        model: completion.model,
        object: completion.object,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              context: {
                citations: completion.choices[0].message.context.citations,
                intent: completion.choices[0].message.context.intent
              }
            },
            end_turn: false,
            finish_reason: null
          }
        ]
      };
    };

    let retValue = {
      completion: completionObj,
      citations: citationsObj
    };

    return retValue;
  }

  #checkIfMessageIsComplete(message) {
    let braces = 0;
    for (var i = 0, len = message.length; i < len; ++i) {
      switch (message[i]) {
        case '{':
          ++braces;
          break;
        case '}':
          --braces;
          break;
      }
    }
    return (braces === 0) ? true : false;
  }

  #sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  async #streamChatCompletion(req_id, t_id, app_id, router_res, oai_res) {
    const reader = oai_res.body.getReader(); // use Nodejs native fetch!
    // const reader = oai_res.body; // use node-fetch library!

    // Send 200 response status and headers
    let res_hdrs = CustomRequestHeaders.RequestId;
    router_res.setHeader('Content-Type', 'text/event-stream');
    router_res.setHeader('Cache-Control', 'no-cache');
    router_res.setHeader('Connection', 'keep-alive');
    router_res.set(CustomRequestHeaders.RequestId, req_id);
    if (t_id) {
      res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.set("Access-Control-Expose-Headers", res_hdrs);
    router_res.flushHeaders();

    let chkPart = null;
    let recv_data = '';
    let call_data = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // 1. Debugging start - Finished
        // console.log("**** FINISHED ****");
        break;
      };

      router_res.write(value); // write the value out to router response/output stream

      const decoder = new TextDecoder("utf-8");
      const chunk = decoder.decode(value);

      const arr = chunk.split('\n'); // ID09242024.sn
      // arr.forEach((data) => {
      for (const data of arr) {
        // if (data.length === 0) return; // ignore empty message
        if (data.length === 0) continue; // ignore empty message

        if (data === 'data: [DONE]')
          // return;
          break;

        // 2. Line data
        // console.log(`**** DATA ****: ${data}`);
        let pdata = '';
        if (data.includes("data: "))
          pdata = data.substring("data: ".length);
        else
          pdata = data;

        if (chkPart) {
          let cdata = chkPart.concat(pdata);
          if (cdata.includes("data: "))
            pdata = cdata.substring("data: ".length);
          else
            pdata = cdata;
          // 3. Stitched line data fragments
          // console.log(`**** C-DATA ****: ${cdata}`);
        };

        try {
          const jsonMsg = JSON.parse(pdata);
          // 4.a Parsed data
          // console.log(`**** P-DATA ****: ${pdata}`);
          chkPart = null;

          if (!jsonMsg.choices || jsonMsg.choices.length === 0) {
            console.log("streamCompletion(): Skipping this line");

            // ID02152025.sn
            if (jsonMsg.usage && call_data)
              call_data.usage = jsonMsg.usage;
            // ID02152025.en
          }
          else {
            let content = jsonMsg.choices[0].delta.content;
            if (content)
              // recv_data += jsonMsg.choices[0].delta.content;
              recv_data = recv_data.concat(content);

            if (!call_data && (jsonMsg.created > 0))
              call_data = {
                id: jsonMsg.id,
                object: jsonMsg.object,
                created: jsonMsg.created,
                model: jsonMsg.model,
                system_fingerprint: jsonMsg.system_fingerprint
              };
          };
        }
        catch (error) {
          // let chkdata = ( chkPart) ? chkPart.concat(pdata) : pdata;
          // chkPart = chkdata;
          chkPart = pdata;
          // 4.b Partial data
          // console.log(`**** ChkPart ****: ${chkPart}`);
        };

        /**
              if ( pdata.startsWith("{") && pdata.endsWith("}") && this.#checkIfMessageIsComplete(pdata) ) {
                // 4. Parsed data
          console.log(`**** P-DATA ****: ${pdata}`);
                chkPart = '';
      
                const jsonMsg = JSON.parse(pdata);
      
                if (!jsonMsg.choices || jsonMsg.choices.length === 0)
            console.log("streamCompletion(): Skipping this line");
                else {
            let content = jsonMsg.choices[0].delta.content;
            if ( content ) 
              // recv_data += jsonMsg.choices[0].delta.content;
              recv_data = recv_data.concat(content);
      
                  if ( ! call_data && (jsonMsg.created > 0) )
              call_data = {
                id: jsonMsg.id,
                object: jsonMsg.object,
                created: jsonMsg.created,
                model: jsonMsg.model,
                system_fingerprint: jsonMsg.system_fingerprint
              };
                };
              }
              else {
          let chkdata = chkPart + pdata;
                chkPart = chkdata;
        };
        */
      }; // ID09242024.en
      // });

      /* for ( const message of this.#processChunk(chunk) ) { // ID09242024.so
        try {
    msg += message;
          console.log(`MESSAGE: ${msg}`);

      if ( msg.startsWith("{") && msg.endsWith("}") && this.#checkIfMessageIsComplete(msg) ) {
            // console.log(`MESSAGE: ${msg}`);

            const jsonMsg = JSON.parse(msg);
      if ( (jsonMsg.choices.length > 0) && jsonMsg.choices[0].delta.content )
        recv_data += jsonMsg.choices[0].delta.content;

            if ( ! call_data && (jsonMsg.created > 0) )
        call_data = {
          id: jsonMsg.id,
          object: jsonMsg.object,
          created: jsonMsg.created,
          model: jsonMsg.model,
          system_fingerprint: jsonMsg.system_fingerprint
        };
      msg = '';
    };
        }
        catch (error) {
          logger.log({level: "warn", message: "[%s] %s.streamChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Message:\n  %s\n Error:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,message,error]});
        }
      }; ID09242024.eo */
    }; // end of while
    // 5. Check if chunk part was not processed!
    // console.log(`ChkPart: ${chkPart}`);

    logger.log({ level: "debug", message: "[%s] %s.streamChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Completion: %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, recv_data] });

    let resp_data = this.#constructCompletionMessage(recv_data, null, call_data);

    // 6. Final streamed response to be saved in cache/memory
    // console.log(`**** CACHE/MEMORY DATA ****\n ${JSON.stringify(resp_data,null,2)}`);
    return resp_data;
  }

  async #streamChatCompletionOyd(req_id, t_id, app_id, router_res, oai_res) {
    const reader = oai_res.body.getReader();

    // Send 200 response status and headers
    let res_hdrs = CustomRequestHeaders.RequestId;
    router_res.setHeader('Content-Type', 'text/event-stream');
    router_res.setHeader('Cache-Control', 'no-cache');
    router_res.setHeader('Connection', 'keep-alive');
    router_res.set(CustomRequestHeaders.RequestId, req_id);
    if (t_id) {
      res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.set("Access-Control-Expose-Headers", res_hdrs);
    router_res.flushHeaders();

    let recv_data = "";
    let cit_data = "";
    let chunkCount = 0;
    let call_data = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      router_res.write(value); // write the value out to router response/output stream

      const decoder = new TextDecoder("utf-8");
      const chunk = decoder.decode(value);
      // console.log(`Decoded value: ${chunk}`);

      if (chunk.startsWith("data: "))
        chunkCount++;

      if (chunkCount === 1) { // Citation data
        const clean_data = chunk.replace(/^data: /, "").trim();
        cit_data += clean_data;
      };

      if (chunkCount > 1) { // Content data
        const lines = chunk.split("data:");
        // console.log(`chunk_count: ${chunkCount}; length: ${lines.length}`);
        const parsedLines = lines
          .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
          .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
          .map((line) => {
            // console.log(`Parsed Line: ${line}`);
            return (JSON.parse(line))
          }); // Parse the JSON string 

        for (const parsedLine of parsedLines) {
          const { choices } = parsedLine;
          if (choices.length > 0) {
            const { delta } = choices[0];
            const { content } = delta;
            if (content)
              recv_data += content;

            if (!call_data)
              call_data = {
                id: parsedLine.id,
                object: parsedLine.object,
                created: parsedLine.created,
                model: parsedLine.model,
                system_fingerprint: parsedLine.system_fingerprint
              };
          };
        }; // end of for loop
      };
    }; // end of while loop

    logger.log({ level: "debug", message: "[%s] %s.streamChatCompletionOyd():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Citations:\n  %s\n  Completion:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, cit_data, recv_data] });

    let resp_data = this.#constructCompletionMessage(recv_data, cit_data, call_data);

    return resp_data;
  }

  async #streamCachedChatCompletion(
    req_id,
    t_id,
    app_id,
    router_res,
    res_payload) {
    // Send 200 response status and headers
    let res_hdrs = CustomRequestHeaders.RequestId;
    router_res.setHeader('Content-Type', 'text/event-stream');
    router_res.setHeader('Cache-Control', 'no-cache');
    router_res.setHeader('Connection', 'keep-alive');
    router_res.set(CustomRequestHeaders.RequestId, req_id);
    if (t_id) {
      res_hdrs += ', ' + CustomRequestHeaders.ThreadId;
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.set("Access-Control-Expose-Headers", res_hdrs);
    router_res.flushHeaders();

    let msgChunk = this.#constructCompletionStreamMessage(res_payload)
    // console.log(`***** CACHED MESSAGE:\n${JSON.stringify(msgChunk)}`);
    if (msgChunk.citations) {
      const cit_data = "data: " + JSON.stringify(msgChunk.citations) + "\n\n";
      router_res.write(cit_data, 'utf8', () => {
        logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Citations:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, cit_data] });
      });
    };

    const value0 = "data: " + JSON.stringify({
      choices: [],
      created: 0,
      id: "",
      model: "",
      object: "",
      prompt_filter_results: [  // Safe to return 'safe sev' for all harm categories as this is a cached response!
        {
          prompt_index: 0,
          content_filter_results: {
            hate: {
              filtered: false,
              severity: "safe",
            },
            self_harm: {
              filtered: false,
              severity: "safe",
            },
            sexual: {
              filtered: false,
              severity: "safe",
            },
            violence: {
              filtered: false,
              severity: "safe",
            }
          }
        }
      ]
    }) + "\n\n";
    router_res.write(value0, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Prompt-Filter:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value0] });
    });

    const value1 = "data: " + JSON.stringify(msgChunk.completion) + "\n\n";
    router_res.write(value1, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Completion:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value1] });
    });

    const value2 = "data: " + JSON.stringify({
      choices: [
        {
          content_filter_results: {},
          delta: {},
          finish_reason: "stop",
          index: 0
        }
      ],
      created: msgChunk.completion.created,
      id: msgChunk.completion.id,
      model: msgChunk.completion.model,
      object: msgChunk.completion.object,
      system_fingerprint: null
    }) + "\n\n";
    router_res.write(value2, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Stop:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value2] });
    });

    const value3 = 'data: [\"Done\"]\n\n';
    router_res.write(value3, 'utf8', () => {
      logger.log({ level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Done:\n  %s", splat: [scriptName, this.constructor.name, req_id, t_id, app_id, value3] });
    });

    return {
      http_code: 200, // All ok. Serving completion from cache.
      cached: true
    };
  }
  // ID06052024.en

  #toolsMessagesNotPresent(msgs) { // ID03142025.n
    let retval = true;
    msgs.forEach(element => {
      if (element.tool_calls) {
        retval = false;

        return;
      }
    });

    return (retval);
  }

  async #getOpenAICallMetadata(req, element, config) { // ID06162025.n
    const meta = new Map();
    meta.set('Content-Type', 'application/json');
    
    let bearerToken = req.headers['Authorization'] || req.headers['authorization'];
    if (config.appType === AzAiServices.OAI) {
      if (bearerToken && !req.authInfo) { // Authorization header present; Use MID Auth ID10302024.n; + Ensure AI App Gateway is not configured with Entra ID ID11152024.n
        if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true") // ID03052025.n
          bearerToken = await getAccessToken(req);
        meta.set('Authorization', bearerToken);
        logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using bearer token for Az OAI Auth. Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
      }
      else { // Use API Key Auth ID10302024.en
        if (process.env.AZURE_AI_SERVICE_MID_AUTH === "true") { // ID03052025.n
          bearerToken = await getAccessToken(req);
          meta.set('Authorization', bearerToken);
          logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using bearer token for Az OAI Auth. Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
        }
        else {
          const authHdrKey = element.uri.includes(OpenAIBaseUri) ? 'Authorization' : 'api-key';
          const authHdrVal = element.uri.includes(OpenAIBaseUri) ? "Bearer " + element.apikey : element.apikey;
          // meta.set('api-key', element.apikey); ID06162025.o
          meta.set(authHdrKey,authHdrVal); // ID06162025.n
          logger.log({ level: "debug", message: "[%s] %s.#getOpenAICallMetadata(): Using API Key for Az OAI Auth. Request ID: %s", splat: [scriptName, this.constructor.name, req.id] });
        };
      };
    }
    else { // ~ Az Ai Model Inference API models
      if (bearerToken && !req.authInfo) // Authorization header present; Use MID Auth ID10302024.n; + Ensure AI App Gateway is not configured with Entra ID ID11152024.n
        meta.set('Authorization', bearerToken);
      else // Use API Key Auth ID10302024.en
        meta.set('Authorization', "Bearer " + element.apikey);
      /*
      delete req.body.presence_penalty;
      delete req.body.frequency_penalty; */
      meta.set('extra-parameters', 'drop'); // Drop any parameters the model doesn't understand; Don't return an error!
    };

    return(meta);
  }

  async processRequest(
    req, // 0
    res, // 1 ID06052024.n
    config) { // 2

    let apps = req.targeturis; // Ai applications object
    let cacheConfig = req.cacheconfig; // global cache config
    let memoryConfig = arguments[3]; // AI application state management config ID05062024.n
    let appConnections = arguments[4]; // EP metrics obj for all apps
    let cacheMetrics = arguments[5]; // Cache hit metrics obj for all apps
    const userMemConfig = arguments[6]; // ID05142025.n; AI App specific long term memory config
    const routerInstance = arguments[7]; // ID06162025.n; AI App specific endpoint router instance
    let manageState = (process.env.API_GATEWAY_STATE_MGMT === 'true') ? true : false
    let instanceName = (process.env.POD_NAME) ? apps.serverId + '-' + process.env.POD_NAME : apps.serverId; // Server instance name ID11112024.n

    // State management is only supported for chat completion API!
    if (memoryConfig && (!req.body.messages)) // If the request is not of type == chat completion
      memoryConfig = null;

    // Long term memory management is only supported for chat completion API!; ID05142025.n
    if (userMemConfig && (!req.body.messages)) // If the request is not of type == chat completion
      userMemConfig = null;

    // 1. Get thread ID in request header
    let threadId = req.get(CustomRequestHeaders.ThreadId);
    let threadStarted = false; // ID04302025.n

    // console.log(`*****\nAzOaiProcessor.processRequest():\n  URI: ${req.originalUrl}\n  Request ID: ${req.id}\n  Application ID: ${config.appId}\n  Type: ${config.appType}`);
    logger.log({ level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  URL: %s\n  User: %s\n  Thread ID: %s\n  Application ID: %s\n  Type: %s\n  Request Payload:\n  %s", splat: [scriptName, this.constructor.name, req.id, req.originalUrl, req.user?.name, threadId, config.appId, config.appType, JSON.stringify(req.body, null, 2)] }); // ID07292024.n

    let respMessage = null; // IMPORTANT: Populate this var before returning!

    // 2. Check prompt present in cache?
    // Has caching been disabled on the request using query param ~
    // 'use_cache=false' ?
    let useCache = config.useCache;
    if (useCache && req.query.use_cache)
      useCache = req.query.use_cache === 'false' ? false : useCache;

    let vecEndpoints = null;
    let embeddedPrompt = null;
    let cacheDao = null;
    let memoryDao = null;
    let promptDao = null;
    let values = null;
    let err_msg = null;
    let uriIdx = 0;
    let endpointId = 0; // ID05082025.n
    let routerEndpointId; // ID06162025.n
    let routerIdTried = false; // ID06162025.n
    let userMessage = req.body.messages.find(msg => msg.role === "user")?.content;// ID05142025.n

    let epdata = appConnections.getConnection(config.appId); // ID04302025.n

    if (!threadId) {
      // if ( cacheConfig.cacheResults && useCache ) { // Is caching enabled?; ID03142025.o
      if (cacheConfig.cacheResults && useCache && ((!req.body.tools) && this.#toolsMessagesNotPresent(req.body.messages))) { // Is caching enabled?; ID03142025.n;
        for (const application of apps.applications) {
          if (application.appId == cacheConfig.embeddApp) {
            vecEndpoints = application.endpoints;

            break;
          };
        };

        /**
         * ID05142025.sn
         * When state management is enabled, is this the first/initial request?
         * Is long term memory enabled for this AI App? &
         * Is user value present in the request payload?
        if ( userMemConfig && req.body.user )
          await updateSystemMessage(
            req,
            config.appId,
            userMemConfig,
            new UserMemDao(appConnections.getConnection(cacheConfig.embeddApp), vecEndpoints));  // This method updates the request payload (req.body)!
          // console.log(`***** Updated request body *****\n${JSON.stringify(req.body,null,2)}\n************`);
        // ID05142025.en */

        // Perform semantic search using input prompt
        cacheDao = new CacheDao(
          appConnections.getConnection(cacheConfig.embeddApp),
          vecEndpoints,
          config.srchType,
          config.srchDistance,
          config.srchContent);

        const { rowCount, simScore, completion, embeddings } =
          await cacheDao.queryVectorDB(
            // req.id, ID03052025.o
            req, // ID03052025.n
            config.appId,
            // req.body, ID03052025.o
            cachedb
          );

        if (rowCount === 1) { // Cache hit!
          cacheMetrics.updateCacheMetrics(config.appId, simScore);

          if (req.body.messages && manageState && memoryConfig && memoryConfig.useMemory) { // Generate thread id if manage state == true
            threadId = randomUUID();

            // When response is served from the cache and state mgmt is turned on, update the thread count of the first end-point
            for (const element of config.appEndpoints) { // ID04302025.n
              let metricsObj = epdata.get(element.uri);
              metricsObj.updateUserThreads();

              break;
            };
          };

          respMessage = (req.body.stream) ?
            this.#streamCachedChatCompletion(req.id, threadId, config.appId, res, completion) :
            {
              http_code: 200, // All ok. Serving completion from cache.
              cached: true,
              data: completion
            };

          if (req.body.messages && manageState && memoryConfig && memoryConfig.useMemory) { // Manage state for this AI application?
            respMessage.threadId = threadId;

            // ID05312024.sn
            let saveMsg = {
              role: completion.choices[0].message.role,
              content: completion.choices[0].message.content
            };
            // ID05312024.en
            // req.body.messages.push(completion.choices[0].message); ID05312024.o
            req.body.messages.push(saveMsg); // ID05312024.n
            logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Prompt + Cached Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });

            memoryDao = new PersistDao(persistdb, TblNames.Memory);
            values = [
              req.id,
              instanceName, // ID11112024.n
              threadId,
              config.appId,
              {
                content: req.body.messages
              },
              req.body.user, // ID04112024.n
              0 // ID05082025.n
            ];

            await memoryDao.storeEntity(req.id, 0, values);
          };

          return (respMessage);
        }
        else
          embeddedPrompt = embeddings;
      }; // No caching configured
    }
    else { // Start of user session if
      memoryDao = new PersistDao(persistdb, TblNames.Memory);
      values = [
        threadId,
        config.appId
      ];

      // retrieve the thread context
      const userContext = await memoryDao.queryTable(req.id, 1, values);
      if (userContext.rCount === 1) {
        let ctxContent = userContext.data[0].context.content;
        let ctxMsgs = ctxContent.concat(req.body.messages);

        if (memoryConfig.msgCount >= 1)
          this.#checkAndPruneCtxMsgs(memoryConfig.msgCount, ctxMsgs);

        req.body.messages = ctxMsgs;
        endpointId = userContext.data[0].endpoint_id; // ID05082025.n

        logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Prompt + Retrieved Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });
      }
      else {
        /* ID06132024.so
              err_msg = {
                endpointUri: req.originalUrl,
                currentDate: new Date().toLocaleString(),
                errorMessage: `The user session associated with Thread ID=[${threadId}] has either expired or is invalid! Start a new user session.`
              };
        ID06132024.eo */
        // ID06132024.sn  
        err_msg = {
          error: {
            target: req.originalUrl,
            message: `The user session associated with Thread ID=[${threadId}] has either expired or is invalid! Start a new user session.`,
            code: "invalidPayload"
          }
        };
        // ID06132024.en  

        respMessage = {
          http_code: 400, // Bad request
          data: err_msg
        };

        return (respMessage);
      };

      if ( memoryConfig.affinity ) // ID06162025.n
        routerIdTried = true;
    }; // end of user session if

    /**
     * ID05142025.sn
     * When state management is enabled, is this the first/initial request?
     * Is long term memory enabled for this AI App? &
     * Is user value present in the request payload?
     */
    if (!threadId && userMemConfig && req.body.user)
      await updateSystemMessage(
        req,
        config.appId,
        userMemConfig,
        new UserMemDao(appConnections.getConnection(cacheConfig.embeddApp), vecEndpoints));  // This method updates the request payload (req.body)!
    // console.log(`***** Updated request body *****\n${JSON.stringify(req.body,null,2)}\n************`);
    // ID05142025.en

    let endpointIdMatched = (manageState && memoryConfig && memoryConfig.useMemory && memoryConfig.affinity) ? false : true; // ID05082025.n

    /**
     * ID06162025.sn
     * Populate an array to track which endpoints have been tried
     */
    let triedEps = new Array(config.appEndpoints.length).fill(false);
    // ID06162025.en

    if ( routerInstance ) // ID06162025.n
      routerEndpointId = routerInstance.getEndpointId(req.id);

    // 3. Call Azure OAI endpoint(s)
    // let epdata = appConnections.getConnection(config.appId); ID04302025.o
    let response;
    let retryAfter = 0;
    let data;
    let stTime;
    do { // ID06162025.n

      uriIdx = 0;  // Initialize the endpoint index!
      for (const element of config.appEndpoints) { // start of endpoint loop
        if (!endpointIdMatched && (uriIdx !== endpointId)) { // ID05082025.n
          uriIdx++;

          continue;
        }
        else
          endpointIdMatched = true;

        if ( (!routerIdTried) && (routerEndpointId !== null) && (routerEndpointId >= 0) ) { // ID06162025.n
          if ( uriIdx !== routerEndpointId ) {
            uriIdx++

            continue;
          }
          else
            routerIdTried = true;
        };

        if (triedEps[uriIdx]) { // ID06162025.n; This endpoint has been called/invoked so skip and go to next!
          uriIdx++;

          continue;
        }
        else
          triedEps[uriIdx] = true;

        uriIdx++;

        let metricsObj = epdata.get(element.uri);
        let healthArr = metricsObj.isEndpointHealthy(req.id); // ID05082025.n
        // console.log(`******isAvailable=${healthArr[0]}; retryAfter=${healthArr[1]}`);
        if (!healthArr[0]) {
          if (retryAfter > 0)
            retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
          else
            retryAfter = healthArr[1];

          continue;
        };

        try {
          const meta = await this.#getOpenAICallMetadata(req, element, config); // ID06162025.n

          // ID06162025.sn
          if ( routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter) )
            routerInstance.updateUriConnections(req.id, true, uriIdx - 1); 
          // ID06162025.en

          stTime = Date.now();
          response = await fetch(element.uri, {
            method: req.method,
            headers: meta,
            body: JSON.stringify(req.body)
          });

          let status = response.status;
          if (status === 200) { // All Ok
            // data = await response.json(); ID06052024.o
            // ID06052024.sn
            // let th_id = !threadId && (manageState && memoryConfig && memoryConfig.useMemory) ? randomUUID() : threadId; // ID04302025.o
            let th_id = !threadId && (manageState && memoryConfig && memoryConfig.useMemory) ? (function () { threadStarted = true; return (randomUUID()); })() : threadId; // ID04302025.n
            if (req.body.stream) // Streaming request?
              data = (req.body.data_sources) ?
                await this.#streamChatCompletionOyd(req.id, th_id, config.appId, res, response) :  // OYD call
                await this.#streamChatCompletion(req.id, th_id, config.appId, res, response); // Chat completion call
            else
              data = await response.json();
            // ID06052024.en

            let respTime = Date.now() - stTime;
            metricsObj.updateApiCallsAndTokens(
              data.usage?.total_tokens,
              respTime,
              threadStarted // ID04302025.n
            );

            // ID02202024.sn
            if ((!threadId) && cacheDao && embeddedPrompt) { // Cache results ?
              let prompt = req.body.prompt;
              if (!prompt)
                prompt = JSON.stringify(req.body.messages);

              values = [
                req.id,
                instanceName, // ID11112024.n
                config.appId,
                prompt,
                pgvector.toSql(embeddedPrompt),
                data
              ];

              await cacheDao.storeEntity(
                0,
                values,
                cachedb
              );
            };
            // ID02202024.en

            if (th_id && req.body.stream) // ID06052024.n
              threadId = th_id;

            // ID03012024.sn
            let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
            if (persistPrompts) { // Persist prompt and completion ?
              // ----- ID02112025.sn
              const allHeaders = {};
              for (const [name, value] of response.headers.entries()) {
                allHeaders[name] = value;
              }
              // console.log(`**** AOAI Headers ****:\n${JSON.stringify(allHeaders, null, 2)}`);
              // ------ ID02112025.en
              promptDao = new PersistDao(persistdb, TblNames.Prompts);
              values = [
                req.id,
                instanceName, // ID11112024.n
                config.appId,
                req.body,
                data, // ID04112024.n
                allHeaders, // ID02112025.n
                req.body.user, // ID04112024.n
                respTime / 1000, // ID11082024.n
                (element.id) ? element.id : "index-" + (uriIdx - 1) // ID05082025.n
              ];

              await promptDao.storeEntity(
                req.id,
                0,
                values
              );
            };
            // ID03012024.en

            // ID06162025.sn
            if ( routerInstance && (routerInstance.routerType === EndpointRouterTypes.WeightedDynamicRouter) )
              routerInstance.updateWeightsBasedOnLatency(uriIdx - 1, respTime); 
            // ID06162025.en

            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1),
              cached: false,
              data: data
            };

            retryAfter = 0;  // ID05282024.n (Bugfix; Set the retry after var to zero!!)
            break; // break out from the endpoint for loop!
          }
          else if (status === 429) { // Endpoint is busy so try next one
            data = await response.json();

            let retryAfterSecs = response.headers.get('retry-after');
            // let retryAfterMs = headers.get('retry-after-ms');

            if (retryAfter > 0)
              retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
            else
              retryAfter = retryAfterSecs;

            metricsObj.updateFailedCalls(status, retryAfterSecs);

            // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n  Retry seconds: ${retryAfterSecs}\n*****`);
            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s\n  Retry seconds: %d", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, status, response.statusText, JSON.stringify(data, null, 2), retryAfterSecs] });
          }
          else if (status === 400 || status === 422) { // Invalid prompt ~ content filtered; ID11062024.n
            data = await response.json();

            // ID03012024.sn
            let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
            if (persistPrompts) { // Persist prompts ?
              // ----- ID02112025.sn
              const allHeaders = {};
              for (const [name, value] of response.headers.entries()) {
                allHeaders[name] = value;
              }
              // console.log(`**** AOAI Headers ****:\n${JSON.stringify(allHeaders, null, 2)}`);
              // ------ ID02112025.en
              promptDao = new PersistDao(persistdb, TblNames.Prompts);
              values = [
                req.id,
                instanceName, // ID11112024.n
                config.appId,
                req.body,
                data, // ID04112024.n
                allHeaders, // ID02112025.n
                req.body.user, // ID04112024.n
                (Date.now() - stTime) / 1000, // ID11082024.n
                (element.id) ? element.id : "index-" + (uriIdx - 1) // ID05082025.n
              ];

              await promptDao.storeEntity(
                req.id,
                0,
                values
              );
            };
            // ID03012024.en

            // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n*****`);
            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, status, response.statusText, JSON.stringify(data, null, 2)] });

            metricsObj.updateFailedCalls(status, 0);
            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1), // ID03262025.n
              status_text: response.statusText,
              data: data
            };

            break;
          }
          else { // Authz failed
            data = await response.text();

            // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n*****`);
            logger.log({ level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message:\n  %s", splat: [scriptName, this.constructor.name, config.appId, req.id, element.uri, status, response.statusText, JSON.stringify(data, null, 2)] });

            metricsObj.updateFailedCalls(status, 0);

            /* ID06132024.so
            err_msg = {
                    appId: config.appId,
                    reqId: req.id,
                    targetUri: element.uri,
                    http_code: status,
              status_text: response.statusText,
              data: data,
                    cause: `AI Service endpoint returned exception message [${response.statusText}]`
                  };
            ID06132024.eo */
            // ID06132024.sn
            err_msg = {
              error: {
                target: element.uri,
                message: `AI Service endpoint returned exception: [${data}].`,
                code: "unauthorized"
              }
            };
            // ID06132024.en

            respMessage = {
              http_code: status,
              uri_idx: (uriIdx - 1), // ID03262025.n
              data: err_msg
            };

            retryAfter = 1; // ID06162025.n; Log the failed call in the endpoint metrics object, try other available endpoints (if any)
            // break; // ID06162025.o
          };
        }
        catch (error) {
          /* ID06132024.so
                err_msg = {
            appId: config.appId,
            reqId: req.id,
            targetUri: element.uri,
            cause: error
          };
          ID06132024.eo */
          // ID06132024.sn
          err_msg = {
            error: {
              target: element.uri,
              message: `AI Services Gateway encountered exception: [${error}].`,
              code: "internalFailure"
            }
          };
          // ID06132024.en
          // console.log(`*****\nAzOaiProcessor.processRequest():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
          logger.log({ level: "error", message: "[%s] %s.processRequest():\n  ID: %s\n  Priority: %d\n  Encountered exception:\n  %s", splat: [scriptName, this.constructor.name, element.id, (uriIdx - 1), JSON.stringify(err_msg, null, 2)] });

          respMessage = {
            http_code: 500,
            uri_idx: (uriIdx - 1), // ID03262025.n
            data: err_msg
          };

          // break; // ID04172024.n; ID06162025.o
          retryAfter = 1; // ID06162025.n; Try remaining endpoints if any!
        }
        finally { // ID06162025.sn
          if ( routerInstance && (routerInstance.routerType === EndpointRouterTypes.LeastConnectionsRouter) )
            routerInstance.updateUriConnections(req.id, false, uriIdx - 1); 
        }; // ID06162025.en
      }; // end of endpoint for loop

    }
    while ((retryAfter > 0) && triedEps.some(val => val === false)); // ID06162025.n

    // instanceFailedCalls++;

    if (retryAfter > 0) {
      /* ID06132024.so
      err_msg = {
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
        errorMessage: `All backend OAI endpoints are too busy! Retry after [${retryAfter}] seconds ...`
      };
      ID06132024.eo */
      if (respMessage == null) { // ID06162025.n
        // ID06132024.sn
        err_msg = {
          error: {
            target: req.originalUrl,
            message: `All backend Azure OAI endpoints are too busy! Retry after [${retryAfter}] seconds ...`,
            code: "tooManyRequests"
          }
        };
        // ID06132024.en

        // res.set('retry-after', retryAfter); // Set the retry-after response header
        respMessage = {
          http_code: 429, // Server is busy, retry later!
          uri_idx: (uriIdx - 1), // ID05082025.n
          data: err_msg,
          retry_after: retryAfter
        };
      };  // ID06162025.n
    }
    else {
      if (respMessage == null) {
        /* ID06132024.so
              err_msg = {
                endpointUri: req.originalUrl,
                currentDate: new Date().toLocaleString(),
                errorMessage: "Internal server error. Unable to process request. Check server logs."
              };
        ID06132024.eo */
        // ID06132024.sn
        err_msg = {
          error: {
            target: req.originalUrl,
            message: "Internal server error. Unable to process request. Please check server logs.",
            code: "internalFailure"
          }
        };
        // ID06132024.en

        respMessage = {
          http_code: 500, // Internal API Gateway server error!
          data: err_msg
        };

        logger.log({ level: "error", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Exception:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(respMessage, null, 2)] }); // ID05082025.n
      };
    };

    // ID05062024.sn
    if ((respMessage.http_code === 200) &&
      req.body.messages && // state management is only supported for chat completions API
      manageState &&
      memoryConfig &&
      memoryConfig.useMemory) { // Manage state for this AI application?

      let completionMsg = {
        role: data.choices[0].message.role,
        content: data.choices[0].message.content
      };

      req.body.messages.push(completionMsg);

      memoryDao = new PersistDao(persistdb, TblNames.Memory);
      if (!threadId)
        threadId = randomUUID();

      logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Completed Message:\n  %s", splat: [scriptName, this.constructor.name, req.id, threadId, JSON.stringify(req.body.messages, null, 2)] });

      values = [
        req.id,
        instanceName, // ID11112024.n
        threadId,
        config.appId,
        {
          content: req.body.messages
        },
        req.body.user, // ID04112024.n
        (uriIdx - 1) //ID05082025.n
      ];

      if (req.get(CustomRequestHeaders.ThreadId)) // Update
        await memoryDao.storeEntity(req.id, 1, values);
      else // Insert
        await memoryDao.storeEntity(req.id, 0, values);

      respMessage.threadId = threadId;

      // ID02142025.sn  Update the threadid in the prompts table for each request
      if (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') {
        promptDao = new PersistDao(persistdb, TblNames.Prompts);
        values = [
          req.id,
          instanceName,
          config.appId,
          threadId
        ];

        await promptDao.storeEntity(
          req.id,
          1,
          values
        );
      };
      // ID02142025.en
    };
    // ID05062024.en

    /**
     * ID05142025.sn
     * Was response generated OK? &
     * Is long term memory enabled for this AI App? &
     * Is user value present in the request payload?
     */
    if ((respMessage.http_code === 200) &&
      userMemConfig &&
      req.body.user) {
      // 1) Construct the input message
      const extractionPrompt =
        getExtractionPrompt(
          req.body.user,
          userMessage,
          data.choices[0].message.content,
          userMemConfig);

      let epMetricsObject = null;
      let aiAppEndpoints = null;
      if (userMemConfig.aiAppName) {
        for (const application of apps.applications) {
          if (application.appId == userMemConfig.aiAppName) {
            aiAppEndpoints = application.endpoints;
            epMetricsObject = appConnections.getConnection(application.appId);

            break;
          };
        };
      }
      if (!aiAppEndpoints || !epMetricsObject) { // Fallback to using current model's metrics obj. and backend endpoints?
        aiAppEndpoints = config.appEndpoints;
        epMetricsObject = epdata;
      };

      // 2) Extract user facts from input query and assistant reply
      const extraction = await callAiAppEndpoint(req, epMetricsObject, aiAppEndpoints, extractionPrompt);
      if (extraction) {
        const factMsg = extraction.choices[0].message.content;
        logger.log({ level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Facts: %s", splat: [scriptName, this.constructor.name, req.id, threadId, factMsg] });
        if (!factMsg.startsWith("No extractable facts")) {
          const facts = extraction.choices[0].message.content.split('\n').filter(Boolean);

          if (facts.length > 0) {
            // 3.1) Check to see if embedd model AI App endpoints are populated
            if (!vecEndpoints) {
              for (const application of apps.applications) {
                if (application.appId == cacheConfig.embeddApp) {
                  vecEndpoints = application.endpoints;

                  break;
                };
              };
            };

            // 3.2) Vectorize & store facts in user facts table
            const userMemDao = new UserMemDao(appConnections.getConnection(cacheConfig.embeddApp), vecEndpoints);
            await storeUserFacts(req, config.appId, facts, userMemDao);  // This method stores each fact in user facts table.
          };
        };
      };
    };
    // ID05142025.en

    return (respMessage);
  } // end of processRequest()
}

module.exports = AzOaiProcessor;