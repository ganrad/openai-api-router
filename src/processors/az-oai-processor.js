/**
 * Name: Azure OAI processor
 * Description: This class implements a processor for executing Azure Open AI API requests.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID05062024: ganrad: Introduced memory feature (state management) for appType = Azure OpenAI Service
 * ID05282024: ganrad: (Bugfix) Reset the 'retryAfter' value when the request is served with an available endpoint.
 * ID05312024: ganrad: (Bugfix) Save only the message content retrieved from cache in memory for a new thread.
 * ID06052024: ganrad: (Enhancement) Added streaming support for Azure OpenAI Chat Completion API call(s).
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('../utilities/logger');

// const fetch = require("node-fetch"); ID06052024.o
const CacheDao = require("../utilities/cache-dao.js"); // ID02202024.n
const cachedb = require("../services/cp-pg.js"); // ID02202024.n
const { TblNames, PersistDao } = require("../utilities/persist-dao.js"); // ID03012024.n
const persistdb = require("../services/pp-pg.js"); // ID03012024.n
const pgvector = require("pgvector/pg"); // ID02202024.n
const { CustomRequestHeaders } = require("../utilities/app-gtwy-constants.js"); // ID05062024.n
const { randomUUID } = require('node:crypto'); // ID05062024.n

class AzOaiProcessor {

  constructor() {
  }

  #checkAndPruneCtxMsgs(count,msgs) {
    let aCount = 3 + (count * 2);
    
    let mLength = msgs.length;

    if ( mLength > aCount )
      msgs.splice(3,2); // keep the original system + prompt and completion

    return(msgs)
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
	if ( line ) yield line;
        previous = previous.slice(eolIndex + 1);
      }
    };
    if ( previous.startsWith("data: " ) ) yield previous;
  }

  * #linesToMessages(linesAsync) {
    let message;
    for (const line of linesAsync) {
      if ( line.startsWith("data: ") )
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

    if ( citations ) {
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
    };

    return(completionObj);
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
    if ( completion.choices[0].message.context ) {
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
    for (var i=0, len = message.length; i<len; ++i) {
      switch(message[i]) {
        case '{' : 
          ++braces;
          break;
        case '}' : 
          --braces;
          break;
      }
    }
    return (braces === 0) ? true : false;
  }

  async #streamChatCompletion(req_id, t_id, app_id, router_res, oai_res) {
    const reader = oai_res.body.getReader(); // use Nodejs native fetch!
    // const reader = oai_res.body; // use node-fetch library!

    // Send 200 response status and headers
    router_res.setHeader('Content-Type','text/event-stream');
    router_res.setHeader('Cache-Control','no-cache');
    router_res.setHeader('Connection','keep-alive');
    if ( t_id) {
      router_res.set("Access-Control-Expose-Headers", CustomRequestHeaders.ThreadId);
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.flushHeaders();

    let msg = "";
    let recv_data = "";
    let call_data = null;
    while ( true ) {
      const { done, value } = await reader.read();
      if ( done ) {
	// console.log("FINISHED");
	break;
      };

      router_res.write(value); // write the value out to router response/output stream

      const decoder = new TextDecoder("utf-8");
      const chunk = decoder.decode(value);
      // console.log(`Decoded value: ${chunk}`);

      for ( const message of this.#processChunk(chunk) ) {
        try {
	  msg += message;

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
	    msg = "";
	  };
        }
        catch (error) {
          logger.log({level: "warn", message: "[%s] %s.streamChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Message:\n  %s\n Error:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,message,error]});
        }
      };
    }; // end of while

    logger.log({level: "warn", message: "[%s] %s.streamChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Completion: %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,recv_data]});

    let resp_data = this.#constructCompletionMessage(recv_data, null, call_data);

    return resp_data;
  }

  async #streamChatCompletionOyd(req_id, t_id, app_id, router_res, oai_res) {
    const reader = oai_res.body.getReader();

    // Send 200 response status and headers
    router_res.setHeader('Content-Type','text/event-stream');
    router_res.setHeader('Cache-Control','no-cache');
    router_res.setHeader('Connection','keep-alive');
    if ( t_id ) {
      router_res.set("Access-Control-Expose-Headers", CustomRequestHeaders.ThreadId);
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.flushHeaders();

    let recv_data = "";
    let cit_data = "";
    let chunkCount = 0;
    let call_data = null;
    while ( true ) {
      const { done, value } = await reader.read();
      if ( done ) break;

      router_res.write(value); // write the value out to router response/output stream

      const decoder = new TextDecoder("utf-8");
      const chunk = decoder.decode(value);
      // console.log(`Decoded value: ${chunk}`);

      if ( chunk.startsWith("data: ") )
        chunkCount++;

      if ( chunkCount === 1 ) { // Citation data
        const clean_data = chunk.replace(/^data: /,"").trim();
        cit_data += clean_data;
      };

      if ( chunkCount > 1 ) { // Content data
        const lines = chunk.split("data:");
        // console.log(`chunk_count: ${chunkCount}; length: ${lines.length}`);
        const parsedLines = lines
          .map((line) => line.replace(/^data: /, "").trim()) // Remove the "data: " prefix
          .filter((line) => line !== "" && line !== "[DONE]") // Remove empty lines and "[DONE]"
          .map((line) => {
	    // console.log(`Parsed Line: ${line}`);
	    return(JSON.parse(line))
	  }); // Parse the JSON string 
		
        for (const parsedLine of parsedLines) {
          const { choices } = parsedLine;
   	  if ( choices.length > 0 ) {
            const { delta } = choices[0];
            const { content } = delta;
            if (content)
	      recv_data += content;

      	    if ( ! call_data )
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

    logger.log({level: "warn", message: "[%s] %s.streamChatCompletionOyd():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Citations:\n  %s\n  Completion:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,cit_data,recv_data]});

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
    router_res.setHeader('Content-Type','text/event-stream');
    router_res.setHeader('Cache-Control','no-cache');
    router_res.setHeader('Connection','keep-alive');
    if ( t_id ) {
      router_res.set("Access-Control-Expose-Headers", CustomRequestHeaders.ThreadId);
      router_res.set(CustomRequestHeaders.ThreadId, t_id);
    };
    router_res.flushHeaders();

    let msgChunk = this.#constructCompletionStreamMessage(res_payload)
    // console.log(`***** CACHED MESSAGE:\n${JSON.stringify(msgChunk)}`);
    if ( msgChunk.citations ) {
      const cit_data = "data: " + JSON.stringify(msgChunk.citations) + "\n\n";
      router_res.write(cit_data, 'utf8',() => {
        logger.log({level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Citations:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,cit_data]});
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
    router_res.write(value0,'utf8',() => { 
      logger.log({level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Prompt-Filter:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,value0]});
    });

    const value1 = "data: " + JSON.stringify(msgChunk.completion) + "\n\n";
    router_res.write(value1,'utf8',() => { 
      logger.log({level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Completion:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,value1]});
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
    router_res.write(value2,'utf8',() => { 
      logger.log({level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Stop:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,value2]});
    });

    const value3 = 'data: [\"Done\"]\n\n';
    router_res.write(value3,'utf8',() => {
      logger.log({level: "debug", message: "[%s] %s.streamCachedChatCompletion():\n  Request ID: %s\n  Thread ID: %s\n  Application ID: %s\n  Done:\n  %s", splat: [scriptName,this.constructor.name,req_id,t_id,app_id,value3]});
    });

    return {
      http_code: 200, // All ok. Serving completion from cache.
      cached: true
    };
  }
  // ID06052024.en

  async processRequest(
    req, // 0
    res, // 1 ID06052024.n
    config) { // 2

    let apps = req.targeturis; // Ai applications object
    let cacheConfig = req.cacheconfig; // global cache config
    let memoryConfig = arguments[3]; // AI application state management config ID05062024.n
    let appConnections = arguments[4]; // EP metrics obj for all apps
    let cacheMetrics = arguments[5]; // Cache hit metrics obj for all apps
    let manageState = (process.env.API_GATEWAY_STATE_MGMT === 'true') ? true : false
	
    // State management is only supported for chat completion API!
    if ( memoryConfig && (! req.body.messages) ) // If the request is not of type == chat completion
      memoryConfig = null;

    // 1. Check thread ID in request header
    let threadId = req.get(CustomRequestHeaders.ThreadId);

    // console.log(`*****\nAzOaiProcessor.processRequest():\n  URI: ${req.originalUrl}\n  Request ID: ${req.id}\n  Application ID: ${config.appId}\n  Type: ${config.appType}`);
    logger.log({level: "info", message: "[%s] %s.processRequest(): Request ID: %s\n  URL: %s\n  Thread ID: %s\n  Application ID: %s\n  Type: %s\n Request Payload: %s", splat: [scriptName,this.constructor.name,req.id,req.originalUrl,threadId,config.appId,config.appType,JSON.stringify(req.body)]});
    
    let respMessage = null; // Populate this var before returning!

    // 2. Check prompt present in cache
    // Has caching been disabled on the request using query param ~
    // 'use_cache=false' ?
    let useCache = config.useCache;
    if ( useCache && req.query.use_cache )
      useCache = req.query.use_cache === 'false' ? false : useCache;

    let vecEndpoints = null;
    let embeddedPrompt = null;
    let cacheDao = null;
    let memoryDao = null;
    let values = null;
    let err_msg = null;

    if (! threadId) { 
      if ( cacheConfig.cacheResults && useCache ) { // Is caching enabled?
        for ( const application of apps.applications) {
          if ( application.appId == cacheConfig.embeddApp ) {
            vecEndpoints = application.endpoints;

            break;
          };
        };

        // Perform semantic search using input prompt
        cacheDao = new CacheDao(
          appConnections.getConnection(cacheConfig.embeddApp),
          vecEndpoints,
          config.srchType,
          config.srchDistance,
          config.srchContent);

        const {rowCount, simScore, completion, embeddings} =
          await cacheDao.queryVectorDB(
            req.id,
            config.appId,
            req.body,
            cachedb
          );

        if ( rowCount === 1 ) { // Cache hit!
          cacheMetrics.updateCacheMetrics(config.appId, simScore);

          if ( manageState && memoryConfig && memoryConfig.useMemory ) // Generate thread id if manage state == true
	    threadId = randomUUID();
		 
	  respMessage = ( req.body.stream ) ?
   	    this.#streamCachedChatCompletion(req.id, threadId, config.appId, res, completion) :
	    {
	      http_code: 200, // All ok. Serving completion from cache.
	      cached: true,
	      data: completion
	    };

          if ( manageState && memoryConfig && memoryConfig.useMemory ) { // Manage state for this AI application?
            respMessage.threadId = threadId;

	    // ID05312024.sn
	    let saveMsg = {
	      role: completion.choices[0].message.role,
	      content: completion.choices[0].message.content
	    };
	    // ID05312024.en
            // req.body.messages.push(completion.choices[0].message); ID05312024.o
            req.body.messages.push(saveMsg); // ID05312024.n
            logger.log({level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Prompt + Cached Message: %s", splat: [scriptName,this.constructor.name,req.id,threadId,JSON.stringify(req.body.messages)]});

            memoryDao = new PersistDao(persistdb, TblNames.Memory);
            values = [
              req.id,
              threadId,
              config.appId,
	      {
	        content: req.body.messages
	      },
	      req.body.user // ID04112024.n
            ];

            await memoryDao.storeEntity(0,values);
	  };

          return(respMessage);
        }
        else
          embeddedPrompt = embeddings;
      }
    }
    else { // Start of user session if
      memoryDao = new PersistDao(persistdb, TblNames.Memory);
      values = [
        threadId,
        config.appId
      ];
      
      // retrieve the thread context
      const userContext = await memoryDao.queryTable(req.id,0,values)
      if ( userContext.rCount === 1 ) {
	let ctxContent = userContext.data[0].context.content;
	let ctxMsgs = ctxContent.concat(req.body.messages);

	if ( memoryConfig.msgCount >= 1 ) 
	  this.#checkAndPruneCtxMsgs(memoryConfig.msgCount, ctxMsgs);

	req.body.messages = ctxMsgs;

        logger.log({level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Prompt + Retrieved Message: %s", splat: [scriptName,this.constructor.name,req.id,threadId,JSON.stringify(req.body.messages)]});
      }
      else {
        err_msg = {
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
          errorMessage: `The user session associated with Thread ID=[${threadId}] has either expired or is invalid! Start a new user session.`
        };

	respMessage = {
	  http_code: 400, // Bad request
	  data: err_msg
	};

	return(respMessage);
      };
    }; // end of user session if

    // 3. Call Azure OAI endpoint(s)
    let epdata = appConnections.getConnection(config.appId);
    let stTime = Date.now();

    let response;
    let retryAfter = 0;
    let data;
    for (const element of config.appEndpoints) { // start of endpoint loop
      let metricsObj = epdata.get(element.uri); 
      let healthArr = metricsObj.isEndpointHealthy();
      // console.log(`******isAvailable=${healthArr[0]}; retryAfter=${healthArr[1]}`);
      if ( ! healthArr[0] ) {
        if ( retryAfter > 0 )
  	  retryAfter = (healthArr[1] < retryAfter) ? healthArr[1] : retryAfter;
	else
	  retryAfter = healthArr[1];
        
	continue;
      };

      try {
        const meta = new Map();
        meta.set('Content-Type','application/json');
        meta.set('api-key',element.apikey);

        response = await fetch(element.uri, {
          method: req.method,
	  headers: meta,
          body: JSON.stringify(req.body)
        });

	let status = response.status;
        if ( status === 200 ) { // All Ok
          // data = await response.json(); ID06052024.o
	  // ID06052024.sn
	  let th_id = ! threadId && ( manageState && memoryConfig && memoryConfig.useMemory ) ? randomUUID() : threadId;
	  if ( req.body.stream ) // Streaming request?
	    data = ( req.body.data_sources ) ? 
	      await this.#streamChatCompletionOyd(req.id,th_id,config.appId,res,response) :  // OYD call
	      await this.#streamChatCompletion(req.id,th_id,config.appId,res,response); // Chat completion call
	  else
            data = await response.json();
	  // ID06052024.en

          let respTime = Date.now() - stTime;
	  metricsObj.updateApiCallsAndTokens(
            data.usage?.total_tokens,
            respTime);

          // ID02202024.sn
          if ( (! threadId) && cacheDao && embeddedPrompt ) { // Cache results ?
            let prompt = req.body.prompt;
            if ( ! prompt )
              prompt = JSON.stringify(req.body.messages);

            let values = [
              req.id,
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

	  if ( th_id && req.body.stream ) // ID06052024.n
	    threadId = th_id;

          // ID03012024.sn
          let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
          if ( persistPrompts ) { // Persist prompt and completion ?
            let promptDao = new PersistDao(persistdb, TblNames.Prompts);
            let values = [
              req.id,
              config.appId,
              req.body,
	      data, // ID04112024.n
	      req.body.user // ID04112024.n
            ];

            await promptDao.storeEntity(
              0,
              values
            );
          };
          // ID03012024.en

	  respMessage = {
	    http_code: status,
	    cached: false,
	    data: data
	  };

          retryAfter = 0;  // ID05282024.n (Bugfix; Set the retry after var to zero!!)
	  break; // break out from the endpoint loop!
        }
        else if ( status === 429 ) { // endpoint is busy so try next one
          data = await response.json();

	  let retryAfterSecs = response.headers.get('retry-after');
	  // let retryAfterMs = headers.get('retry-after-ms');

	  if ( retryAfter > 0 )
	    retryAfter = (retryAfterSecs < retryAfter) ? retryAfterSecs : retryAfter;
	  else
	    retryAfter = retryAfterSecs;

	  metricsObj.updateFailedCalls(status,retryAfterSecs);

          // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n  Retry seconds: ${retryAfterSecs}\n*****`);
	  logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s\n  Retry seconds: %d", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,JSON.stringify(data),retryAfterSecs]});
        }
        else if ( status === 400 ) { // Invalid prompt ~ content filtered
          data = await response.json();

          // ID03012024.sn
          let persistPrompts = (process.env.API_GATEWAY_PERSIST_PROMPTS === 'true') ? true : false
          if ( persistPrompts ) { // Persist prompts ?
            let promptDao = new PersistDao(persistdb, TblNames.Prompts);
            let values = [
              req.id,
              config.appId,
              req.body,
	      data, // ID04112024.n
	      req.body.user // ID04112024.n
            ];

            await promptDao.storeEntity(
              0,
              values
            );
          };
          // ID03012024.en

          // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n  Status Text: ${statusText}\n*****`);
	  logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,JSON.stringify(data)]});

	  metricsObj.updateFailedCalls(status,0);
	  respMessage = {
	    http_code: status,
	    status_text: response.statusText,
	    data: data
	  };

          break;
        }
        else { // Authz failed
          data = await response.text();

          // console.log(`*****\nAzOaiProcessor.processRequest():\n  App Id: ${config.appId}\n  Request ID: ${req.id}\n  Target Endpoint: ${element.uri}\n  Status: ${status}\n  Message: ${JSON.stringify(data)}\n*****`);
	  logger.log({level: "warn", message: "[%s] %s.processRequest():\n  App Id: %s\n  Request ID: %s\n  Target Endpoint: %s\n  Status: %s\n  Status Text: %s\n  Message: %s", splat: [scriptName,this.constructor.name,config.appId,req.id,element.uri,status,response.statusText,JSON.stringify(data)]});

	  metricsObj.updateFailedCalls(status,0);

	  err_msg = {
            appId: config.appId,
            reqId: req.id,
            targetUri: element.uri,
            http_code: status,
	    status_text: response.statusText,
	    data: data,
            cause: `AI Service endpoint returned exception message [${response.statusText}]`
          };
	
	  respMessage = {
	    http_code: status,
	    data: err_msg
	  };
        };
      }
      catch (error) {
        err_msg = {
	  appId: config.appId,
	  reqId: req.id,
	  targetUri: element.uri,
	  cause: error
	};
        // console.log(`*****\nAzOaiProcessor.processRequest():\n  Encountered exception:\n  ${JSON.stringify(err_msg)}\n*****`)
	logger.log({level: "error", message: "[%s] %s.processRequest():\n  Encountered exception:\n  %s", splat: [scriptName,this.constructor.name,err_msg]});

	respMessage = {
          http_code: 500,
	  data: err_msg
	};

        break; // ID04172024.n
      };
    }; // end of endpoint loop

    // instanceFailedCalls++;

    if ( retryAfter > 0 ) {
      err_msg = {
        endpointUri: req.originalUrl,
        currentDate: new Date().toLocaleString(),
        errorMessage: `All backend OAI endpoints are too busy! Retry after [${retryAfter}] seconds ...`
      };

      // res.set('retry-after', retryAfter); // Set the retry-after response header
      respMessage = {
        http_code: 429, // Server is busy, retry later!
        data: err_msg,
	retry_after: retryAfter
      };
    }
    else {
      if ( respMessage == null ) {
        err_msg = {
          endpointUri: req.originalUrl,
          currentDate: new Date().toLocaleString(),
          errorMessage: "Internal server error. Unable to process request. Check server logs."
        };
	respMessage = {
	  http_code: 500, // Internal API Gateway server error!
	  data: err_msg
	};
      };
    };

    // ID05062024.sn
    if ( (respMessage.http_code === 200) && manageState && memoryConfig && memoryConfig.useMemory ) { // Manage state for this AI application?

      let completionMsg = {
	role: data.choices[0].message.role,
	content: data.choices[0].message.content
      };

      req.body.messages.push(completionMsg); 

      memoryDao = new PersistDao(persistdb, TblNames.Memory);
      if ( ! threadId )
	threadId = randomUUID();

      logger.log({level: "debug", message: "[%s] %s.processRequest():\n  Request ID: %s\n  Thread ID: %s\n  Completed Message: %s", splat: [scriptName,this.constructor.name,req.id,threadId,JSON.stringify(req.body.messages)]});
	
      values = [
        req.id,
        threadId,
        config.appId,
        {
          content: req.body.messages
	},
	req.body.user // ID04112024.n
      ];

      if ( req.get(CustomRequestHeaders.ThreadId) ) // Update
	await memoryDao.storeEntity(1,values);
      else // Insert
        await memoryDao.storeEntity(0,values);

      respMessage.threadId = threadId;
    };
    // ID05062024.en

    return(respMessage);
  } // end of processRequest()
}

module.exports = AzOaiProcessor;
