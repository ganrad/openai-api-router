// Adjust the system prompt as needed
const defaultPrompt = "You are a helpful AI Assistant trained by OpenAI."; // Default prompt

let threadId = null;
let aiAppObject = null;
let promptObject = null;
let isAuthEnabled = false;
let envContext; // Load the context on initialization!
let aiAppConfig = new Map();
let hdrs = new Map();
const serverUriPrefix = "/ais-chatbot/ui/";

function loadAuthScript() {
  let scriptEle = document.createElement('script');
  scriptEle.setAttribute("src","./auth.js");
  scriptEle.setAttribute("type","text/javascript");
  scriptEle.setAttribute("async", false);

  document.body.appendChild(scriptEle);

  scriptEle.addEventListener("load", () => {
    console.log('loadAuthScript(): auth.js has been loaded.');
  });

  scriptEle.addEventListener("error", () => {
    console.error('loadAuthScript(): Error loading auth.js.');
  });
}

async function readAiAppConfig() {
  try {
    // Wait for the fetch to complete
    const response = await fetch(serverUriPrefix.concat("appconfig"));

    // Check if the response is ok (status code 200-299)
    if (!response.ok) {
      throw new Error(`readAiAppConfig(): Encountered HTTP error! Status: ${response.status}`);
    }

    // Wait for the response to be parsed as JSON
    const context = await response.json();

    let selectElem = document.getElementById('appdropdown');
    let idx = 1;
    for (const app of context.ai_apps) {
      console.log(`readAiAppConfig(): AI Application: ${app.ai_app_name}`);
      aiAppConfig.set(app.ai_app_name, app);

      let opt = document.createElement('option');
      opt.value = idx;
      opt.innerHTML = app.ai_app_name;
      selectElem.appendChild(opt);
      idx++;
    };

    envContext = context;
    console.log(`readAiAppConfig(): AI APP Gateway URI: ${envContext.aisGtwyEndpoint}`);
    isAuthEnabled = context.aisGtwyAuth; // Is security enabled on AI App Gateway?
    console.log(`readAiAppConfig(): Backend security: ${isAuthEnabled}`);

    if ( isAuthEnabled )
      loadAuthScript();
    else // hide 'sign-in' link
      document.getElementById("auth-anchor").style.display="none";
  } catch (error) {
    // Handle any errors that occurred during the fetch
    console.error('readAiAppConfig(): Error fetching data:', error);
  };

  let sysPromptElem = document.getElementById("sysPromptField");
  sysPromptElem.innerHTML = defaultPrompt;
}

readAiAppConfig();

function setInferenceTarget() {
  const aiAppElem = document.getElementById('appdropdown');
  const aiApp = aiAppElem.options[aiAppElem.selectedIndex].text;

  aiAppObject = aiAppConfig.get(aiApp);

  // Set the system prompt
  if ( aiAppObject.sysPrompt )
    document.getElementById("sysPromptField").value = aiAppObject.sysPrompt;

  // Set the model config form fields
  document.getElementById("descField").innerHTML = aiAppObject.description;
  document.getElementById("uid").value = isAuthEnabled ? username : aiAppObject.user;
  document.getElementById("stream").checked = aiAppObject.model_params.stream;
  document.getElementById("stopSequence").value = aiAppObject.model_params.stop;
  document.getElementById("temperature").value = aiAppObject.model_params.temperature;
  document.getElementById("temp_o").value = aiAppObject.model_params.temperature;
  document.getElementById("mtokens").value = aiAppObject.model_params.max_tokens;
  document.getElementById("mtokens_o").value = aiAppObject.model_params.max_tokens;
  document.getElementById("frequency").value = aiAppObject.model_params.frequency_penalty;
  document.getElementById("freq_o").value = aiAppObject.model_params.frequency_penalty;
  document.getElementById("presence").value = aiAppObject.model_params.presence_penalty;
  document.getElementById("perf_o").value = aiAppObject.model_params.presence_penalty;
  document.getElementById("topp").value = aiAppObject.model_params.top_p;
  document.getElementById("topp_o").value = aiAppObject.model_params.top_p;

  // Construct & populate a new prompt object
  promptObject = {
    messages: [],
    max_tokens: aiAppObject.model_params.max_tokens,
    user: isAuthEnabled ? username : aiAppObject.user,
    stream: aiAppObject.model_params.stream,
    temperature: aiAppObject.model_params.temperature,
    top_p: aiAppObject.model_params.top_p,
    stop: aiAppObject.model_params.stop,
    presence_penalty: aiAppObject.model_params.presence_penalty,
    frequency_penalty: aiAppObject.model_params.frequency_penalty
  };

  // Create and populate ai search data source
  let srchParams = aiAppObject.search_params;
  if (srchParams) {
    // Set the search config form fields
    document.getElementById("searchAppName").value = srchParams.ai_search_app;
    document.getElementById("endpoint").value = srchParams.endpoint;
    document.getElementById("indexName").value = srchParams.index_name;
    document.getElementById("scope").checked = srchParams.in_scope;
    document.getElementById("queryType").value = srchParams.query_type;
    document.getElementById("embeddModel").value = srchParams.embedding_model;
    document.getElementById("semConfig").value = srchParams.semantic_config;
    document.getElementById("strictness").value = srchParams.strictness;
    document.getElementById("strict_o").value = srchParams.strictness;
    document.getElementById("docs").value = srchParams.top_n_docs;
    document.getElementById("docs_o").value = srchParams.top_n_docs;

    let dataSource = {
      type: "azure_search",
      parameters: {
        endpoint: srchParams.endpoint,
        index_name: srchParams.index_name,
        authentication: {
          type: "api_key",
          key: srchParams.ai_search_app // Specify the API Key for chat completion + OYD calls
        },
        embedding_dependency: {
          deployment_name: srchParams.embedding_model,
          type: "deployment_name"
        },
        query_type: srchParams.query_type,
        semantic_configuration: srchParams.semantic_config,
        in_scope: srchParams.in_scope,
        strictness: srchParams.strictness,
        top_n_documents: srchParams.top_n_docs
      }
    };

    promptObject.data_sources = [dataSource];

    document.getElementById("searchCfgSaveBtn").disabled = false;
  } // end - if srchParams
  else {
    document.getElementById("searchCfgSaveBtn").disabled = true;
  }
  clearContent("chatBox"); // Clear the content of the chat box and msg box
}

function clearContent(elementId) {
  if (elementId === "chatBox") {
    threadId = null;

    clearContent("msgBox"); // Recursive call!
  };

  document.getElementById(elementId).innerHTML = '';
}

function saveContent(configName) {
  if (configName === "modelConfig") {
    promptObject.stream = document.getElementById("stream").checked;
    promptObject.max_tokens = Number(document.getElementById("mtokens").value);
    promptObject.temperature = Number(document.getElementById("temperature").value);
    promptObject.presence_penalty = Number(document.getElementById("presence").value);
    promptObject.frequency_penalty = Number(document.getElementById("frequency").value);
    promptObject.stop = document.getElementById("stopSequence").value;
    promptObject.top_p = Number(document.getElementById("topp").value);

    const alert = document.getElementById('modelConfigToast'); //select id of toast
    const bsAlert = new bootstrap.Toast(alert); //initialize it
    bsAlert.show(); //show it
  };

  if ((configName === "searchConfig") && (promptObject.data_sources)) {
    promptObject.data_sources[0].parameters.in_scope = document.getElementById("scope").checked;
    promptObject.data_sources[0].parameters.query_type = document.getElementById("queryType").value;
    promptObject.data_sources[0].parameters.semantic_configuration = document.getElementById("semConfig").value;
    promptObject.data_sources[0].parameters.strictness = Number(document.getElementById("strictness").value);
    promptObject.data_sources[0].parameters.top_n_documents = Number(document.getElementById("docs").value);

    const alert = document.getElementById('srchConfigToast'); //select id of toast
    const bsAlert = new bootstrap.Toast(alert); //initialize it
    bsAlert.show(); //show it
  };
}

function addJsonToAccordian(time, box, cls, accordian, req, res, reqId) {
  const element = document.createElement('div');
  element.className = "accordian-item";
  element.innerHTML = '<h2 class="accordion-header" id="headingOne"><button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">' +
          new Date().toLocaleString('en-US', { timeZoneName: 'short' }) + ' (' + (time / 1000) + ' seconds)' +
          '</button></h2><div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#msgAccordian"><div class="accordion-body">' +
          '<p><b>Request: </b>(ID = ' + reqId + ')</p>' +
          '<pre class="' + cls + '">' + prettyPrintJson.toHtml(req) + '</pre>' +
          '<p><b>Response:</b></p>' + '<pre class="' + cls + '">' + prettyPrintJson.toHtml(res) + '</pre>' +
          '</div></div>';

  if (!accordian) {
          box.innerHTML = '<div class="accordion" id="msgAccordian"></div>';
          accordian = document.getElementById('msgAccordian');
  };

  // accordian.appendChild(element);
  if (accordian.hasChildNodes())
          accordian.insertBefore(element, accordian.firstChild);
  else
          accordian.appendChild(element);
  // box.scrollTop = box.scrollHeight;
}

function addJsonToBox(box, cls, msg) {
  const element = document.createElement('pre');
  element.className = cls;
  element.innerHTML = prettyPrintJson.toHtml(msg);

  if ( box.hasChildNodes() )
          box.insertBefore(element,box.firstChild);
  else
          box.appendChild(element);
  // box.scrollTop = box.scrollHeight;
}

function addMessageToBox(box, cls, msg) {
  const element = document.createElement('div');
  element.className = cls;

  element.innerHTML = msg;

  box.appendChild(element);
  box.scrollTop = box.scrollHeight;
}

function generateLinkWithOffcanvas(title, fp, body) {
  let uuid = 'offcanvas-' + Math.random().toString(36).slice(2, 7);
  let content = body.replace(/(?:\r\n|\r|\n)/g, '<br>'); // Get rid of all the newlines

  let retHtml = '<a class="btn btn-light btn-sm" data-bs-toggle="offcanvas" href="' + '#' + uuid + '" role="button" aria-controls="' + uuid + '">' + fp + '</a>';
  retHtml += '<div class="offcanvas offcanvas-end" tabindex="-1" id="' + uuid + '" aria-labelledby="' + uuid + 'Label"><div class="offcanvas-header"><h5 class="offcanvas-title" id="' + uuid + 'Label">' + title + '</h5><button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button></div><div class="offcanvas-body"><p class="fs-6">' + content + '</p></div></div>';

  return (retHtml);
}

function extractAndEncloseImageURLs(text) {
  const urlPattern = /(https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif))/g;
  return text.replace(urlPattern, '<img src="$1" alt="Image">');
}

function insertCitationLinks(cits) {
  let refList = '<ul class="list-group">';
  let docNo = 1;

  for (const citation of cits) {
    refList += '<li class="list-group-item"><b>' +
            docNo + '.</b> ' +
            generateLinkWithOffcanvas(citation.title, citation.filepath, extractAndEncloseImageURLs(citation.content)) +
            '</li>';
    docNo++;
  };
  refList += '</ul>';

  let content = '<p><button class="btn btn-info btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapseRefs" aria-expanded="false" aria-controls="collapseRefs">' + (--docNo) + ' references</button></p>';
  content += '<div class="collapse" id="collapseRefs"><div class="card card-body">';
  content += refList;
  content += '</div></div>';

  return content;
}

function addMessageToChatBox(box, cls, msg, ctx) {
  const element = document.createElement('div');
  element.className = cls;

  let content = msg.replace(/(?:\r\n|\r|\n)/g, '<br>'); // Get rid of all the newlines
  if (ctx) {
    let refList = '<ul class="list-group">';
    let docNo = 1;

    for (const citation of ctx.citations) {
      content = content.replaceAll("[doc" + docNo + "]", "<sup>[" + docNo + "]</sup>");
      refList += '<li class="list-group-item"><b>' +
              docNo + '.</b> ' +
              generateLinkWithOffcanvas(citation.title, citation.filepath, extractAndEncloseImageURLs(citation.content)) +
              '</li>';
      // console.log(`Title: ${citation.title}; Filepath: ${citation.filepath}`);
      docNo++;
    };
    refList += '</ul>';

    content = '<p>' + content + '</p>';
    content += '<p><button class="btn btn-info btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapseRefs" aria-expanded="false" aria-controls="collapseRefs">' + (--docNo) + ' references</button></p>';
    content += '<div class="collapse" id="collapseRefs"><div class="card card-body">';
    content += refList;
    content += '</div></div>';
  };

  element.innerHTML = content;

  box.appendChild(element);
  box.scrollTop = box.scrollHeight;
}

function isMessageComplete(message) {
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

/**
* Stream OpenAI completion
* @param{string} prompt
* @param{any} parameters
*/
async function streamCompletion(uri,appId,hdrs,box) {
  try {
    const ds = promptObject.data_sources;
    if ( threadId ) // No OYD call when user session is alive
      delete promptObject.data_sources;

    const sttime = Date.now();
    let response = await fetch(uri, {
      method: "POST", headers: hdrs, body: JSON.stringify(promptObject)
    });
    if ( threadId )
      promptObject.data_sources = ds;

    let status = response.status;
    if (status === 200) {
      // console.log("step-1");
      if (threadId === null) {
        threadId = response.headers.get("x-thread-id");
        const values = {
                application_id: appId,
                user: aiAppObject.user,
                thread_id: threadId,
                start_time: new Date().toLocaleString('en-US', { timeZoneName: 'short' })
        };
        addJsonToBox(
                document.getElementById('infoBox'),
                'json-container',
                values);
      };

      const divelem = document.createElement('div');
      const element = document.createElement('p');
      divelem.className = 'mb-2 rounded bg-light text-dark';
      divelem.appendChild(element);

      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) return;
      // console.log("step-2");
      box.appendChild(divelem);
      // eslint-disable-next-line no-constant-condition
      let chkPart = "";
      let calltime = 0;
      let ttToken = 0;
      let citations = null;
      let citLen = 0;
      while (true) {
      // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        if ( !ttToken ) ttToken = Date.now();

        const arr = value.split('\n');
        arr.forEach((data) => {
          // console.log(`Line: ${data}`);
          if (data.length === 0) return; // ignore empty message
          if (data === 'data: [DONE]') {
            calltime = Date.now() - sttime;
            return;
          };

          let pdata = data.replace("data: ","");
          pdata = chkPart.concat(pdata);
          pdata = pdata.trim();
          // console.log(`Data: ${pdata}`);
          if ( pdata.startsWith("{") && pdata.endsWith("}") && isMessageComplete(pdata) ) {
            chkPart = "";

            const json = JSON.parse(pdata);

            if (!json.choices || json.choices.length === 0) console.log("streamCompletion(): Skipping this line");
            else {
              const msg = json.choices[0].delta.content;
              if ( msg ) {
                const citLen = citations ? citations.length : 0;
                let content = msg.replace(/(?:\r\n|\r|\n)/g, '<br>'); // Get rid of all the newlines
                if ( citLen > 0 ) {
                  for ( let i=1; i <= citLen; i++ )
                    content = content.replaceAll("[doc" + i + "]", "<sup>[" + i + "]</sup>");
                }
                element.innerHTML += content;
                box.scrollTop = box.scrollHeight;
              };

              const context = json.choices[0].delta.context;
              if ( context ) {
                if ( ! citations )
                  citations = context.citations;
                else
                  citations = citations.concat(context.citations);

                citLen = citations ? citations.length : 0;
                console.log(`streamCompletion(): No. of Citations: ${citLen}`);
              };
            };
          }
          else
            chkPart = pdata;
        });
      }; // end of while
      if ( citLen > 0 )
        divelem.innerHTML += insertCitationLinks(citations);

      if ( calltime === 0 ) // If response was served from cache!
        calltime = Date.now() - sttime;

      let strResponse = {
              code: 200,
              message: "OK",
              time_to_first_token: (ttToken - sttime) / 1000,
              total_call_time: calltime / 1000
      };
      addJsonToAccordian(
              calltime,
              document.getElementById('msgBox'),
              'json-container',
              document.getElementById('msgAccordian'),
              promptObject, strResponse, response.headers.get("x-request-id"));
    }
    else {
      const data = await response.json();
      if ( data.error.message?.includes("Thread") ) {
        let msg = "Your chat session [ID = " + threadId + "] has expired.  Please start a new chat session.";
        addMessageToBox(chatBox,'mb-2 rounded bg-light text-info',msg);
      }
      else {
        let msg = "Received an exception from server.  Please refer to the error details in the 'Exceptions' tab.";
        addMessageToBox(chatBox,'mb-2 rounded bg-light text-danger',msg);
      };
      addJsonToBox(
              document.getElementById('errorBox'),
              'json-container',
              data); //Assuming data returned is JSON!
    };
  }
  catch (error) {
    const errorDetails = {
            name: error.name,
            cause: error.cause,
            message: error.message,
            stack: error.stack,
    };
    addJsonToBox(
            document.getElementById('errorBox'),
            'json-container',
            errorDetails);
  }
}

async function sendMessage() {
  const aiAppElem = document.getElementById('appdropdown');
  const aiApp = aiAppElem.options[aiAppElem.selectedIndex].text;
  if (aiApp === "Choose from") { // AI Application not selected

    let popover = new bootstrap.Popover(aiAppElem, {
            animation: true,
            placement: "right",
            // title: "Alert",
            content: "Select an AI Application",
            trigger: "manual"
    });
    popover.show();
    setTimeout(function() { popover.dispose(); },2000);
    return;
  };
  if ( isAuthEnabled && !username ) {
    const loginBtn = document.getElementById('auth-anchor');

    let popover = new bootstrap.Popover(loginBtn, {
            animation: true,
            placement: "top",
            // title: "Alert",
            content: "Sign in to the AI App Gateway",
            trigger: "manual"
    });
    popover.show();
    setTimeout(function() { popover.dispose(); },2000);
    return;
  };

  const userInput = document.getElementById('userInput');
  const message = userInput.value;

  const chatBox = document.getElementById('chatBox');

  let data = null;
  if (message.trim() !== '') {
    document.getElementById('callApiBtn').disabled = true;
    document.getElementById('chatClearBtn').disabled = true;
    document.getElementById('msgClearBtn').disabled = true;
    document.getElementById('infoClearBtn').disabled = true;
    document.getElementById('errorClearBtn').disabled = true;
    document.getElementById('spinnerBtn').style.display = "block";

    addMessageToBox(
            // document.getElementById('chatBox'),
            chatBox,
            'mb-2 rounded bg-secondary text-white',
            message);
    userInput.value = '';
    userInput.disabled = true;

    let sysPrompt = document.getElementById('sysPromptField').value;
    if (!sysPrompt)
            sysPrompt = defaultPrompt;

    let requestHeaders = null;
    promptObject.messages.length = 0;
    if (threadId) {
      hdrs.set("x-thread-id", threadId);
      requestHeaders = new Headers(hdrs);

      // if ( promptObject.data_sources )  // Uncomment these two lines if needed!
      // delete promptObject.data_sources;

      promptObject.messages.push({ role: "user", content: message });
    }
    else {
      hdrs.clear();
      hdrs.set("Content-Type", "application/json");
      requestHeaders = new Headers(hdrs);

      promptObject.messages.push({ role: "system", content: sysPrompt })
      promptObject.messages.push({ role: "user", content: message });
    };

    const appId = aiAppObject.ai_app_name;
    const uri = envContext.aisGtwyEndpoint + appId;
    if ( isAuthEnabled ) {
      const accessToken = await getToken();
      const bearer = `Bearer ${accessToken}`;
      // console.log(`Token: [${bearer}]`);
      requestHeaders.append('Authorization', bearer);
    };

    if ( promptObject.stream ) // Stream response
      await streamCompletion(uri,appId,requestHeaders,chatBox);
    else {
      let status;
      try {
        const ds = promptObject.data_sources;

        if ( threadId )
          delete promptObject.data_sources;
        const sttime = Date.now();
        let response = await fetch(uri, {
          method: "POST", headers: requestHeaders, body: JSON.stringify(promptObject)
        });
        if ( threadId )
          promptObject.data_sources = ds;

        status = response.status; data = await response.json();
        const calltime = Date.now() - sttime;
        if (status === 200) {
          if (threadId === null) {
            threadId = response.headers.get("x-thread-id");
            const values = {
                    application_id: appId,
                    user: aiAppObject.user,
                    thread_id: threadId,
                    start_time: new Date().toLocaleString('en-US', { timeZoneName: 'short' })
            };
            addJsonToBox(
                    document.getElementById('infoBox'),
                    'json-container',
                    values);
          };

          addJsonToAccordian(
                  calltime,
                  document.getElementById('msgBox'),
                  'json-container',
                  document.getElementById('msgAccordian'),
                  promptObject, data, response.headers.get("x-request-id"));

          addMessageToChatBox(
                  // document.getElementById('chatBox'),
                  chatBox,
                  'mb-2 rounded bg-light text-dark',
                  data.choices[0].message.content,
                  data.choices[0].message.context);
        }
        else {
          if ( data.error.message?.includes("Thread") ) {
            let msg = "Your chat session [ID = " + threadId + "] has expired.  Please start a new chat session.";
            addMessageToBox(chatBox,'mb-2 rounded bg-light text-info',msg);
          }
          else {
            let msg = "Received an exception from server.  Please refer to the error details in the 'Exceptions' tab.";
            addMessageToBox(chatBox,'mb-2 rounded bg-light text-danger',msg);
          };
          addJsonToBox(
                  document.getElementById('errorBox'),
                  'json-container',
                  data); //Assuming data returned is JSON!
        };
      }
      catch (error) {
          const errorDetails = {
            name: error.name,
            cause: error.cause,
            message: error.message,
            stack: error.stack,
          };
          addJsonToBox(
            document.getElementById('errorBox'),
            'json-container',
            errorDetails);
      };
    };
    document.getElementById('spinnerBtn').style.display = "none";
    document.getElementById('callApiBtn').disabled = false;
    document.getElementById('chatClearBtn').disabled = false;
    document.getElementById('msgClearBtn').disabled = false;
    document.getElementById('infoClearBtn').disabled = false;
    document.getElementById('errorClearBtn').disabled = false;
    userInput.disabled = false;
  }
}
