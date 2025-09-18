/**
 * Name: SPA UI/Frontend core logic for RAPID.
 * Description: This script contains the core logic for the AI App Gateway SPA frontend/UI.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 07-01-2024
 * Version (Introduced): v1.0.0
 *  
 * Notes:
 * ID10232024: ganrad: v2.0.1-v1.0.1: 1) Added support for MID - user and system assigned MID 2) (Bugfix) OYD stream response was failing intermittently.
 * ID11012024: ganrad: v2.1.0-v1.1.0: Setting the default system prompt causes issues with multi-domain gateway.  Hence not setting it by default.
 * ID11082024: ganrad: v2.1.0-v1.1.0: LLMs exposed by AI Model Inference API expect a value for 'stop' parameter.
 * ID11122024: ganrad: v2.1.0-v1.1.0: (Enhancement) Request ID included in the 'Info' pane is now a link. Clicking this link shows the request details.
 * ID11132024: ganrad: v2.1.0-v1.1.0: (Enhancement) Introduced support for multiple single and multi-domain AI App Gateways.
 * ID11262024: ganrad: v2.1.0-v1.1.0: (Bugfix) When user has signed in and is already authenticated, the 'Sign-in' label was not getting updated.
 * ID12022024: ganrad: v2.1.0-v1.1.0: (Enhancement) Changed font of query + response. GitHub markup returned in OAI model response is converted into HTML 
 * prior to rendering.
 * ID12202024: ganrad: v2.1.0-v1.1.0: (Enhancement) Updated code to support 'o1' family of models. Updated by ID02272025.
 * ID02142025: ganrad: v2.2.0-v1.1.0: (API consistency) Updated '/apirouter/apprequests' endpoint to '/apirouter/requests'.
 * ID02272025: ganrad: v2.3.0-v1.2.0: (Improvements) 1) Implemented multiple UI refinements 2) Introduced support for reasoning models (o1/o3) 3) Added
 * support for requesting + receiving token counts for streamed API calls.
 * ID03132025: ganrad: v2.3.0-v1.2.0: (Enhancements) Added buttons to allow users to save(to clipboard) and like responses.
 * ID03202025: ganrad: v2.3.0-v1.2.0: (Enhancement) Added a button to hide / show (toggle) the model and search config panels (3rd column).
 * ID05142025: ganrad: v2.3.8-v1.3.0: (Bugfix) Replaced GFM library to fix html rendering issues in the console 'chat' box.
 * ID06052025: ganrad: v2.3.8-v1.3.0: (Bugfix) 'max_tokens' parameter is now deprecated in Azure AI Model Inference API. Updated code to use
 * 'max_completion_tokens'.
 * ID06062025: ganrad: v2.3.8-v1.3.0: Renamed this script to 'ai-gateway-core.js'.
 * ID06062025: ganrad: v2.3.8-v1.3.0: (Enhancement) When auth is turned off - To allow different users to test RAPID server, the 
 * username will be auto-generated each time this SPA is refreshed within the browser.
 * ID06162025: ganrad: v2.3.9-v1.3.0: (Enhancement) Introduced support for OpenAI models and endpoints.
 * ID07102025: ganrad: v2.4.0-v1.3.1: (Bugfix, Enhancement) 1) Catch and render auth exception messages 2) Made updates to render AI Foundry Agent 
 * Service citation url's properly.
 * ID08052025: ganrad: v2.4.0-v1.3.1: (Enhancement) Model name can now be specified by the user (in UI) and passed to the AI App Gateway.
 * ID08282025: ganrad: v2.4.5-v1.3.1: (Bugfix) Az Direct Models such as Llama, Grok do not require a 'system' message.
 * ID09162025: ganrad: v2.6.0-v1.3.2: (Enhancement) Introduced support for user feedback capture for models/agents deployed on Azure AI Foundry.
*/
// Adjust the system prompt as needed
const defaultPrompt = "You are a helpful AI Assistant trained by OpenAI."; // Default prompt
const uiUserName = "user-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 8); // ID06062025.n

let threadId = null;
let aiAppObject = null; // AI Application Object selected by the user
let promptObject = null; // AI Application model object
// let lbEndpoint;
let isAuthEnabled = false;
let envContext; // Load the context on initialization. Object used by auth.js.
// Map => [AI App name : AI App object]
let aiAppConfig = new Map();

// Map => [AI Gateway name : Map => [AI App name : AI App object] ]
let aiGatewayConfig = new Map(); // ID11132024.n 
// Map => [AI Gateway name : Gateway object]
let aiGatewayMap = new Map(); // ID11132024.n

let hdrs = new Map();
const serverUriPrefix = "/ais-chatbot/ui/"; // Frontend / UI uri prefix

let msgCounter = 0; // ID03132025.n
/* function readAiAppConfig() {
  fetch(serverUriPrefix.concat("appconfig"))
    .then((response) => response.text())
    .then((text) => {
      const context = JSON.parse(text);

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
      // lbEndpoint = context.aisGtwyEndpoint; // Set the Azure AI App Gateway load balancer endpoint
      console.log(`readAiAppConfig(): AI APP Gateway URI: ${envContext.aisGtwyEndpoint}`);
      isAuthEnabled = context.aisGtwyAuth; // Is security enabled on AI App Gateway?
      console.log(`readAiAppConfig(): Backend security: ${isAuthEnabled}`);
    })
    .catch((error) => {
      console.log("readAiAppConfig(): Encountered exception loading app config file", error);
    });

  let sysPromptElem = document.getElementById("sysPromptField");
  sysPromptElem.innerHTML = defaultPrompt;
} */

function loadAuthScript() {
  let scriptEle = document.createElement('script');
  scriptEle.setAttribute("src", "./auth.js");
  scriptEle.setAttribute("type", "text/javascript");
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

    // ID11132024.sn
    // Populate AI Gateway config
    let appConfig;
    let srvElem = document.getElementById('srvdropdown');
    let srv_idx = 1;
    for (const srv of context.ai_app_gateways) {
      console.log(`readAiAppConfig(): AI Gateway: ${srv.name}`);

      appConfig = new Map();
      for (const app of srv.ai_apps) {
        console.log(`readAiAppConfig(): AI Application: ${app.ai_app_name}`);
        appConfig.set(app.ai_app_name, app);
      };
      aiGatewayConfig.set(srv.name, appConfig);

      let opt = document.createElement('option');
      opt.value = srv_idx;
      opt.innerHTML = srv.name;
      srvElem.appendChild(opt);
      srv_idx++;

      aiGatewayMap.set(srv.name, srv);
    };
    // ID11132024.en

    /* ID11132024.o
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
    */

    envContext = context;
    // console.log(`readAiAppConfig(): AI APP Gateway URI: ${envContext.aisGtwyEndpoint}`); ID11132024.o
    isAuthEnabled = context.aisGtwyAuth; // Is security enabled on AI App Gateway?
    console.log(`readAiAppConfig(): Backend security: ${isAuthEnabled}`);

    if (isAuthEnabled)
      loadAuthScript();
    else // hide 'sign-in' link
      document.getElementById("auth-anchor").style.display = "none";
  } catch (error) {
    // Handle any errors that occurred during the fetch
    console.error('readAiAppConfig(): Error fetching data:', error);
  };

  let sysPromptElem = document.getElementById("sysPromptField");
  sysPromptElem.innerHTML = defaultPrompt;
}

readAiAppConfig();

// ID11132024.sn
function setAiApps() {
  const aiSrvElem = document.getElementById('srvdropdown');
  const aiGtwy = aiSrvElem.options[aiSrvElem.selectedIndex].text;
  // console.log(`setAiApps(): Selected AI Gateway: ${aiGtwy}`);

  if ( aiGtwy === "Choose from" ) {
    aiSrvElem.title = "";
    return;
  };

  const gtwyObject = aiGatewayMap.get(aiGtwy);
  aiSrvElem.title = gtwyObject.uri;

  const aiSrvTypeElem = document.getElementById('srvtype');
  aiSrvTypeElem.value = gtwyObject.type;

  aiAppConfig = aiGatewayConfig.get(aiGtwy);

  let appElem = document.getElementById('appdropdown');
  // First remove all options / apps in the drop down control
  let i, L = appElem.options.length - 1;
  for (i = L; i >= 0; i--) {
    appElem.remove(i);
  };

  // Populate AI Apps in the drop down control
  let idx = 1;
  for (const app of aiAppConfig.keys()) {
    // console.log(`setAiApps(): Adding AI App: ${app}`);

    let opt = document.createElement('option');
    opt.value = idx;
    opt.innerHTML = app;
    appElem.appendChild(opt);
    idx++;
  };

  setInferenceTarget();
}
// ID11132024.en

// ID02272025.sn
function setModelInputVars() {  // Executes after 'setInferenceTarget()'
  const msgTypeElem = document.getElementById('msgtypedropdown');
  const msgType = msgTypeElem.options[msgTypeElem.selectedIndex].value;
  const streamElem = document.getElementById('stream');

  if ( msgType === "developer") { // Developer message; required by reasoning models
    delete promptObject.temperature;
    delete promptObject.top_p;
    delete promptObject.presence_penalty;
    delete promptObject.frequency_penalty;
    // promptObject.max_completion_tokens = promptObject.max_tokens; // ID06052025.o
    // delete promptObject.max_tokens;
    promptObject.stream = false; // No streaming for o1; available for o3-mini

    streamElem.checked = false;
    streamElem.disabled = true;
  }
  else {
    streamElem.disabled = false;
  };
}
// ID02272025.en

function setInferenceTarget() {
  const aiAppElem = document.getElementById('appdropdown');
  const aiApp = aiAppElem.options[aiAppElem.selectedIndex].text;

  aiAppObject = aiAppConfig.get(aiApp);

  // Set the system prompt
  if (aiAppObject.sysPrompt)
    document.getElementById("sysPromptField").value = aiAppObject.sysPrompt;

  // Set the model config form fields
  document.getElementById("descField").innerHTML = aiAppObject.description;
  // document.getElementById("uid").value = isAuthEnabled ? username : aiAppObject.user; ID06062025.o
  document.getElementById("uid").value = isAuthEnabled ? username : uiUserName; // ID06062025.n
  document.getElementById("stream").checked = aiAppObject.model_params.stream;
  document.getElementById("stopSequence").value = aiAppObject.model_params.stop ?? ''; // ID08052025.n
  document.getElementById("modelName").value = aiAppObject.model ?? ''; // ID08052025.n
  document.getElementById("temperature").value = aiAppObject.model_params.temperature;
  document.getElementById("temp_o").value = aiAppObject.model_params.temperature;
  document.getElementById("mtokens").value = aiAppObject.model_params.max_tokens;
  document.getElementById("mtokens_o").value = aiAppObject.model_params.max_tokens;
  document.getElementById("frequency").value = aiAppObject.model_params.frequency_penalty ?? 0; // ID08052025.n
  document.getElementById("freq_o").value = aiAppObject.model_params.frequency_penalty ?? 0;
  document.getElementById("presence").value = aiAppObject.model_params.presence_penalty ?? 0;
  document.getElementById("perf_o").value = aiAppObject.model_params.presence_penalty ?? 0;
  document.getElementById("topp").value = aiAppObject.model_params.top_p;
  document.getElementById("topp_o").value = aiAppObject.model_params.top_p;
  document.getElementById("cache").checked = false; // ID10232024.n

  // Construct & populate a new prompt object
  promptObject = {
    model: aiAppObject.model, // ID06162025.n
    messages: [],
    // max_tokens: aiAppObject.model_params.max_tokens,  // ID06052025.n
    max_completion_tokens:  aiAppObject.model_params.max_tokens,
    // user: isAuthEnabled ? username : aiAppObject.user, ID06062025.o
    user: isAuthEnabled ? username : uiUserName, // ID06062025.n
    stream: aiAppObject.model_params.stream,
    // stream_options: aiAppObject.model_params.stream ? { include_usage: true } : null,
    temperature: aiAppObject.model_params.temperature,
    top_p: aiAppObject.model_params.top_p,
    stop: aiAppObject.model_params.stop ?? null, // ID08052025.n
    presence_penalty: aiAppObject.model_params.presence_penalty ?? null,
    frequency_penalty: aiAppObject.model_params.frequency_penalty ?? null
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

    // ID10232024.sn
    let aiSrchAuth;
    switch (srchParams.auth_type) {
      case "api_key":
        aiSrchAuth = {
          type: srchParams.auth_type,
          key: srchParams.ai_search_app // Specify either [ API Key / AI Search App Name registered in App Gateway ] for chat completion + OYD calls
        };
        break;
      case "system_assigned_managed_identity":
        aiSrchAuth = {
          type: srchParams.auth_type
        };
        break;
      case "user_assigned_managed_identify":
        aiSrchAuth = {
          type: srchParams.auth_type,
          managed_identity_resource_id: srchParams.mid_resource_id // The resource ID of the user-assigned managed identity to use for authentication.
        };
        break;
      default: // System assigned managed identity
        aiSrchAuth = {
          type: "system_assigned_managed_identity"
        };
    };
    // ID10232024.en

    let dataSource = {
      type: "azure_search",
      parameters: {
        endpoint: srchParams.endpoint,
        index_name: srchParams.index_name,
        /* ID10232024.so
        authentication: {
          type: "api_key",
          key: srchParams.ai_search_app // Specify the API Key for chat completion + OYD calls
        },
        ID10232024.eo */
        authentication: aiSrchAuth, // ID10232024.n
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
    msgCounter = 0; // ID03132025.n

    clearContent("msgBox"); // Recursive call!
  };

  document.getElementById(elementId).innerHTML = '';
}

function saveContent(configName) {
  if ( ! promptObject ) { // ID11132024.n
    const aiSrvElem = document.getElementById('srvdropdown');
    const aiSrv = aiSrvElem.options[aiSrvElem.selectedIndex].text;
    if (aiSrv === "Choose from") { // AI Application Gateway not selected

      let popover = new bootstrap.Popover(aiSrvElem, {
        animation: true,
        placement: "right",
        // title: "Alert",
        content: "Select an AI Application Gateway",
        trigger: "manual"
      });
      popover.show();
      setTimeout(function () { popover.dispose(); }, 2000);
      return;
    };
  };

  if (configName === "modelConfig") {
    promptObject.stream = document.getElementById("stream").checked;
    // promptObject.stream_options = promptObject.stream ? { include_usage: true } : null,
    // promptObject.max_tokens = Number(document.getElementById("mtokens").value); // ID06052025.o
    promptObject.max_completion_tokens = Number(document.getElementById("mtokens").value); // ID06052025.n
    promptObject.temperature = Number(document.getElementById("temperature").value);
    let value = Number(document.getElementById("presence").value); // ID08052025.n
    if ( value > 0 )
      promptObject.presence_penalty = value;
    value = Number(document.getElementById("frequency").value);
    if ( value > 0 )
      promptObject.frequency_penalty = value;
    value = document.getElementById("stopSequence").value; // ID11082024.n
    if ((value !== "undefined") && (value.trim().length > 0))
      promptObject.stop = value;
    value = document.getElementById("modelName").value; // ID08052025.n
    if ((value !== "undefined") && value) // ID08052025.n
      promptObject.model = value;
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

function addJsonToAccordian_0(time, box, cls, accordian, req, res, reqId) { // ID11122024.so (Not used!)
  const element = document.createElement('div');
  element.className = "accordian-item";
  element.innerHTML = '<h2 class="accordion-header" id="headingOne"><button class="accordion-button fs-5" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">' +
    new Date().toLocaleString('en-US', { timeZoneName: 'short' }) + ' (' + (time / 1000) + ' seconds)' +
    '</button></h2><div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#msgAccordian"><div class="accordion-body">' +
    '<p><b>Request: </b>(ID = <a href="' + getAiAppGatewayAppReqsUri(aiAppObject.ai_app_name,reqId) + 
    '" class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" target="_blank">' + reqId + '</a>)</p>' +
    '<pre class="' + cls + '">' + prettyPrintJson.toHtml(req) + '</pre>' +
    '<p><b>Response:</b></p>' + '<pre class="' + cls + '">' + prettyPrintJson.toHtml(res) + '</pre>' +
    '</div></div>'; // ID11122024.n

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
} // ID11122024.eo

async function callAiAppGatewayUri(uri, httpMethod, silentMode) { // ID11122024.sn, ID09162025.n
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (isAuthEnabled) {
    const accessToken = await getToken();
    const bearer = `Bearer ${accessToken}`;
    headers.set('Authorization', bearer);
  };

  let status;
  let data;
  try {
    let response = await fetch(uri, {method: (! httpMethod) ? "GET" : httpMethod, headers: headers});

    status = response.status;
    data = await response.json();
  }
  catch (e) {
    console.warn(`callAiAppGatewayUri():\nStatus: ${status}\nURI: ${uri}\nException:\n${e}`);
  };
  if ( status === 200 ) {
    if ( silentMode ) {
      console.log(`callAiAppGatewayUri():\nStatus: ${status}\nURI: ${uri}\nResponse Message:\n${JSON.stringify(data, null, 2)}`);
    }
    else {
      // Open a new tab
      const newTab = window.open();

      // Write the data to the new tab
      newTab.document.write(`<pre>${JSON.stringify(data,null,2)}</pre>`);

      // Close the document to finish loading the content
      newTab.document.close();
    };
  }
  else
    console.warn(`callAiAppGatewayUri():\nStatus: ${status}\nURI: ${uri}\nResponse Message:\n${JSON.stringify(data, null, 2)}`);
} // ID11122024.en

function addJsonToAccordian(time, box, cls, accordian, req, res, reqId) { // ID11122024.sn
  const element = document.createElement('div');
  element.className = "accordian-item";
  let ct = '<h2 class="accordion-header" id="headingOne"><button style="font-size: 14px;" class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">' +
    new Date().toLocaleString('en-US', { timeZoneName: 'short' }) + ' (' + (time / 1000) + ' seconds)' +
    '</button></h2><div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#msgAccordian"><div class="accordion-body">';
  if ( isAuthEnabled )
    ct += '<p><b>Request: </b>(ID = <a href="#" onclick="callAiAppGatewayUri(\'' + getAiAppGatewayAppReqsUri(aiAppObject.ai_app_name,reqId) + '\'); return false;"' +
    ' class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover">' + reqId + '</a>)</p>';
  else
    ct += '<p><b>Request: </b>(ID = <a href="' + getAiAppGatewayAppReqsUri(aiAppObject.ai_app_name,reqId) + 
    '" class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" target="_blank">' + reqId + '</a>)</p>';
  ct += '<pre class="' + cls + '">' + prettyPrintJson.toHtml(req) + '</pre>' +
    '<p><b>Response:</b></p>' + '<pre class="' + cls + '">' + prettyPrintJson.toHtml(res) + '</pre>' +
    '</div></div>';

  element.innerHTML = ct;

  if (!accordian) {
    box.innerHTML = '<div class="accordion" id="msgAccordian"></div>';
    accordian = document.getElementById('msgAccordian');
  };

  if (accordian.hasChildNodes())
    accordian.insertBefore(element, accordian.firstChild);
  else
    accordian.appendChild(element);
} // ID11122024.en

// ID02272025.sn
function addJsonToThreadsTable(box,jsonData) {
  let tableBody = document.getElementById('threadsTableBody');

  if ( !tableBody ) {
    // Create the thread table
    const element = document.createElement('div');
    element.className = "container mt-3";
    const tableStr =
      '<div class="row"> \
        <div class="col"> \
          <table class="table table-striped table-bordered"> \
            <thead> \
              <tr id="threadsTableHeaders"></tr> \
            </thead> \
            <tbody id="threadsTableBody"></tbody> \
          </table> \
        </div> \
      </div>';
    element.innerHTML = tableStr;
    box.appendChild(element);

    const tableHeaders = document.getElementById('threadsTableHeaders');
    // Create table headers
    for (const key in jsonData) {
      if (jsonData.hasOwnProperty(key)) {
        const th = document.createElement('th');
        // th.textContent = key.charAt(0).toUpperCase() + key.slice(1); // Capitalize the first letter; ID05142025.o
        th.textContent = key // ID05142025.n
          .replace(/_/g, ' ') // Replace underscores with spaces
          .split(' ') // Split into words
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize each word
          .join(' '); // Join back into a single string

        tableHeaders.appendChild(th);
      }
    };
  };

  tableBody = document.getElementById('threadsTableBody');
  // Create a single row with the values
  let appId = "";
  const row = document.createElement('tr');
  for (const key in jsonData) {
    if (jsonData.hasOwnProperty(key)) {
      if ( key === 'application_id' )
        appId = jsonData[key];

      const td = document.createElement('td');
      if ( key === 'thread_id' ) {
        let threadLink;
        if ( isAuthEnabled ) 
          threadLink = '<a href="#" onclick="callAiAppGatewayUri(\'' + getAiAppGatewaySessionsUri(appId,jsonData[key]) + '\'); return false;"' +
          ' class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover">' + jsonData[key] + '</a>'
        else
          threadLink = '<a href="' + getAiAppGatewaySessionsUri(appId,jsonData[key]) + 
          '" class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover" target="_blank">' + jsonData[key] + '</a>';
        
        td.innerHTML = threadLink;
      }
      else
        td.textContent = jsonData[key];
      row.appendChild(td);
    }
  }
  tableBody.insertBefore(row, tableBody.firstChild);
}
// ID02252025.en

function addJsonToBox(box, cls, msg) {
  const element = document.createElement('pre');
  element.className = cls;
  element.innerHTML = prettyPrintJson.toHtml(msg);

  if (box.hasChildNodes())
    box.insertBefore(element, box.firstChild);
  else
    box.appendChild(element);
  // box.scrollTop = box.scrollHeight;
}

function addMessageToBox(box, cls, msg) {
  const element = document.createElement('div');
  element.className = cls;

  element.innerHTML = '<pre style="white-space: pre-wrap; overflow-wrap: break-word">' + msg + '</pre>';

  box.appendChild(element);
  box.scrollTop = box.scrollHeight;
}

function generateLinkWithOffcanvas(title, fp, body) {
  // console.log(`Citation before: ${body}`);

  let uuid = 'offcanvas-' + Math.random().toString(36).slice(2, 7);
  // let content = body.replace(/(?:\r\n|\r|\n)/g, '<br>'); // Get rid of all the newlines ID12022024.o
  let content = '<pre style="white-space: pre-wrap; overflow-wrap: break-word">' + body + '</pre>'; // ID12022024.n

  let retHtml = '<a class="btn btn-light btn-sm" data-bs-toggle="offcanvas" href="' + '#' + uuid + '" role="button" aria-controls="' + uuid + '">' + fp + '</a>';
  // retHtml += '<div class="offcanvas offcanvas-end" tabindex="-1" id="' + uuid + '" aria-labelledby="' + uuid + 'Label"><div class="offcanvas-header"><h5 class="offcanvas-title" id="' + uuid + 'Label">' + title + '</h5><button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button></div><div class="offcanvas-body"><p class="fs-6">' + content + '</p></div></div>'; ID12022024.o
  retHtml += '<div class="offcanvas offcanvas-end" tabindex="-1" id="' + uuid + '" aria-labelledby="' + uuid + 'Label"><div class="offcanvas-header"><h5 class="offcanvas-title" id="' + uuid + 'Label">' + title + '</h5><button type="button" class="btn-close text-reset" data-bs-dismiss="offcanvas" aria-label="Close"></button></div><div class="offcanvas-body">' + content + '</div></div>'; // ID12022024.n
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
    if ( citation.filepath ) { // ID07102025.n
      refList += '<li class="list-group-item"><b>' +
        docNo + '.</b> ' +
        generateLinkWithOffcanvas(citation.title, citation.filepath, extractAndEncloseImageURLs(citation.content)) +
        '</li>';
    }
    else { // ID07102025.sn
      refList += '<li class="list-group-item"><b>' +
        docNo + '.</b><a href="' + citation.url + '" class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover">' +
        citation.title + '</a></li>'; 
    }; // ID07102025.en
    docNo++;
  };
  refList += '</ul>';

  let content = '<p><button class="btn btn-info btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapseRefs" aria-expanded="false" aria-controls="collapseRefs">' + (--docNo) + ' references</button></p>';
  content += '<div class="collapse" id="collapseRefs"><div class="card card-body">';
  content += refList;
  content += '</div></div>';

  return content;
}

function addMessageToChatBox_0(box, cls, msg, ctx) { // ID12022024.so (Not used!)
  const element = document.createElement('div');
  element.className = cls;

  // console.log(`Message: ${JSON.stringify(msg, null, 2)}`);
  console.log(`Message before: ${msg}`);
  let content = msg.replace(/(?:\r\n|\r|\n)/g, '<br>');
  // let content = ( msg instanceof String) ? msg.replace(/(?:\r\n|\r|\n)/g, '<br>') : prettyPrintJson.toHtml(msg); // Get rid of all the newlines
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
} // ID12022024.eo

function addRespMsgTitleButtons(element, reqId) { // ID03132025.n, ID09162025.n
  let outerDivElement = document.createElement('div');

  const paraElem = document.createElement('p');
  paraElem.className = "w-100 position-relative";

  const copyBtn = document.createElement('button'); // Copy
  copyBtn.id = "copy-btn-" + msgCounter;
  copyBtn.title = "Copy";
  copyBtn.onclick = async function() {
    try {
      const divElem = document.getElementById(element.id); // document.querySelector(".user-select-all");
      await navigator.clipboard.writeText(divElem.textContent);
      // console.log("Text copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      // Optional: Display an error message to the user
    };
  };
  copyBtn.className = 'btn btn-light btn-sm mt-1 me-1';
  copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';

  const thumbsupBtn = document.createElement('button'); // Thumbs up / Like
  thumbsupBtn.id = "tup-btn-" + msgCounter;
  thumbsupBtn.title = "Like";
  thumbsupBtn.className = 'btn btn-light btn-sm mt-1 me-1';
  thumbsupBtn.innerHTML = '<i class="bi bi-hand-thumbs-up"></i>';
  thumbsupBtn.onclick = async function() { // ID09162025.n
    const uri = getAiAppGatewayAppReqsUri(aiAppObject.ai_app_name,reqId) + '/up';
    await callAiAppGatewayUri(uri, "PUT", true);
  };

  const thumbsDownBtn = document.createElement('button'); // Thumbs down / Dislike
  thumbsDownBtn.id = "tdown-btn-" + msgCounter;
  thumbsDownBtn.title = "Dislike";
  thumbsDownBtn.className = 'btn btn-light btn-sm mt-1 me-1';
  thumbsDownBtn.innerHTML = '<i class="bi bi-hand-thumbs-down"></i>';
  thumbsDownBtn.onclick = async function() { // ID09162025.n
    const uri = getAiAppGatewayAppReqsUri(aiAppObject.ai_app_name,reqId) + '/down';
    await callAiAppGatewayUri(uri, "PUT", true);
  };

  const saveBtn = document.createElement('button'); // Save to a file
  saveBtn.id = "save-msg-btn-" + msgCounter;
  saveBtn.title = "Save";
  saveBtn.onclick = function() {
    const content = document.getElementById(element.id).innerText;
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "content.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  saveBtn.className = 'btn btn-light btn-sm mt-1 me-1';
  saveBtn.innerHTML = '<i class="bi bi-save"></i>';
  
  paraElem.appendChild(copyBtn);
  paraElem.appendChild(saveBtn);
  paraElem.appendChild(thumbsupBtn);
  paraElem.appendChild(thumbsDownBtn);
  msgCounter++;
  outerDivElement.appendChild(paraElem);

  return(outerDivElement);
}

function addMessageToChatBox(box, cls, msg, ctx, reqid) { // ID12022024.sn, ID03132025.n, ID09162025.n
  const element = document.createElement('div');
  element.className = cls + " user-select-all";
  element.id = "chat-msg-" + msgCounter;

  let outerDivElement = addRespMsgTitleButtons(element, reqid); // ID09162025.n
  outerDivElement.appendChild(element);

  // console.log(`Message before: ${msg}`);
  let content = msg;

  let refList = '<ul class="list-group">';
  let docNo = 1;
  if (ctx) {
    for (const citation of ctx.citations) {
      if ( citation.filepath ) { // ID07102025.n
        content = content.replaceAll("[doc" + docNo + "]", "<sup>[" + docNo + "]</sup>");
        refList += '<li class="list-group-item"><b>' +
          docNo + '.</b> ' +
          generateLinkWithOffcanvas(citation.title, citation.filepath, extractAndEncloseImageURLs(citation.content)) +
          '</li>';
        // console.log(`Title: ${citation.title}; Filepath: ${citation.filepath}`);
      }
      else { // ID07102025.sn
        content = content.replaceAll(citation.content, "<sup>[" + docNo + "]</sup>");
        refList += '<li class="list-group-item"><b>' +
          docNo + '.</b><a href="' + citation.url + '" class="link-info link-offset-2 link-underline-opacity-25 link-underline-opacity-100-hover">' +
          citation.title + '</a></li>'; 
      }; // ID07102025.en
      docNo++;
    };
    refList += '</ul>';
  };

  /** ID05142025.so
  const contentElem = document.createElement('pre');
  // Add styles for wrapping words
  contentElem.style.whiteSpace = 'pre-wrap';
  contentElem.style.overflowWrap = 'break-word';
  // contentElem.innerHTML = marked.parse(content);

  // const mdElem = document.createElement('md'); ID05142025.o
  // mdElem.innerHTML = content;
  // contentElem.appendChild(mdElem);

  // element.appendChild(contentElem);
  ID05142025.eo */

  // ID05142025.sn
  element.innerHTML = marked.parse(content);
  element.querySelectorAll('pre code').forEach(block => {
    hljs.highlightElement(block);
  });
  // ID05142025.en

  if ( ctx ) {
    const citElement = document.createElement('span');

    content = '';
    content += '<button class="btn btn-info btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapseRefs" aria-expanded="false" aria-controls="collapseRefs">' + (--docNo) + ' references</button>';
    content += '<div class="collapse" id="collapseRefs"><div class="card card-body">';
    content += refList;
    content += '</div>';

    citElement.innerHTML = content;
    element.appendChild(citElement);
  };

  // box.appendChild(element);
  box.appendChild(outerDivElement);
  box.scrollTop = box.scrollHeight;
  // renderMarkdown(); ID05142025.o
} // ID12022024.en

function toggleConfigColumn() { // ID03202025.n
  let column3 = document.getElementById('configColumn');
  let icon = document.querySelector('.position-absolute i');
  if (column3.style.display === 'none') {
      column3.style.display = 'block';
      icon.classList.remove('bi-eye-slash');
      icon.classList.add('bi-eye');
  } else {
      column3.style.display = 'none';
      icon.classList.remove('bi-eye');
      icon.classList.add('bi-eye-slash');
  }
}

function isMessageComplete(message) { // Not used anymore!
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

/**
* Stream LLM completion
* @param{string} prompt
* @param{any} parameters
*/
async function streamCompletion(serverId, uri, appId, hdrs, box) { // ID02272025.n
  let usageInfo = null; // ID02272025.n

  try {
    const ds = promptObject.data_sources;
    if ( ds ) { // ID05142025.n; OYD call doesn't support 'max_completion_tokens' & 'stream_options' yet!
      delete promptObject.stream_options;
      promptObject.max_tokens = promptObject.max_completion_tokens;
      delete promptObject.max_completion_tokens;
    };

    if (threadId) // No OYD call when user session is alive
      delete promptObject.data_sources;
    const sttime = Date.now();
    let response = await fetch(uri, {
      method: "POST", headers: hdrs, body: JSON.stringify(promptObject)
    });
    if (threadId)
      promptObject.data_sources = ds;

    let status = response.status;
    if (status === 200) {
      // console.log("step-1");
      if (threadId === null) {
        threadId = response.headers.get("x-thread-id");
        const values = {
          ai_app_gateway: serverId,
          application_id: appId,
          thread_id: threadId,
          // user: aiAppObject.user, ID06062025.o
          user: isAuthEnabled ? username : uiUserName, // ID06062025.n
          endpoint_uri: uri,
          start_time: new Date().toLocaleString('en-US', { timeZoneName: 'short' })
        };
        /** ID02272025.o
        addJsonToBox(
          document.getElementById('infoBox'),
          'json-container',
          values);
        */
        if ( threadId ) // Add the thread only when enabled in server! ID02272025.n
          addJsonToThreadsTable(document.getElementById('infoBox'),values); // ID02272025.n
      };

      const divelem = document.createElement('div');
      divelem.className = 'mb-2 rounded bg-light text-dark user-select-all'; // ID05142025.n
      divelem.id = "chat-msg-" + msgCounter; // ID05142025.n

      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) return;
      // console.log("step-2");
      // element.className = "user-select-all"; // ID03132025.sn; ID05142025.o
      // element.id = "chat-msg-" + msgCounter; ID05142025.o

      let outerDivElement = addRespMsgTitleButtons(divelem, response.headers.get("x-request-id")); // ID05142025.n; ID09162025.n
      outerDivElement.appendChild(divelem);
      box.appendChild(outerDivElement); // ID03132025.en 
      // box.appendChild(divelem); ID03132025.o
      // eslint-disable-next-line no-constant-condition
      let chkPart = '';
      let calltime = 0;
      let ttToken = 0;
      let citations = null;
      let citLen = 0;
      let currentBuffer = ""; // ID05142025.n
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        if (!ttToken) ttToken = Date.now();

        console.log(`Raw line:\n${value}`);
        console.log("===== +++++ =====");
        const arr = value.split('\n');
        arr.forEach((data) => {
          // console.log(`Line: ${data}`);
          if (data.length === 0) return; // ignore empty message
          if (data === 'data: [DONE]') {
            calltime = Date.now() - sttime;
            return;
          };

          // let pdata = data.replace('data: ','');
          // let pdata = data.splice(6);
          // let pdata = data.substring("data: ".length);
          let pdata = '';
          if (data.includes("data: "))
            pdata = data.substring("data: ".length);
          else
            pdata = data;

          if (chkPart) {
            let cdata = chkPart + pdata;
            if (cdata.includes("data: "))
              pdata = cdata.substring("data: ".length);
            else
              pdata = cdata;
          };
          try {
            const json = JSON.parse(pdata);
            // console.log(`**** P-DATA ****: ${pdata}`);
            chkPart = '';

            if (!json.choices || json.choices.length === 0) {
              console.log("streamCompletion(): Skipping this line");

              if ( json.usage )
                usageInfo = json.usage;
            }
            else {
              const msg = json.choices[0].delta.content;
              if (msg) {
                citLen = citations ? citations.length : 0;
                // let content = msg.replace(/(?:\r\n|\r|\n)/g, '<br>'); // Get rid of all the newlines ID12022024.o
                let content = msg; // ID12022024.n
                
                /** ID07102025.so
                if (citLen > 0) {
                  for (let i = 1; i <= citLen; i++)
                    content = content.replaceAll("[doc" + i + "]", "<sup>[" + i + "]</sup>");
                };
                ID07102025.eo */

                // ID07102025.sn
                if ( citLen > 0 ) {
                  let i = 1;
                  for (const citation of citations) {
                    // console.log(`**** Message=${content}, Citation Content=${citation.content} ****`);
                    content = content.replaceAll("[doc" + i + "]", "<sup>[" + i + "]</sup>");
                    content = content.replaceAll(citation.content, "<sup>[" + i + "]</sup>");
                    i++;
                  };
                };
                // ID07102025.en

                // ID05142025.sn
                currentBuffer += content;
                const contentHtml = marked.parse(currentBuffer);
                divelem.innerHTML = contentHtml;

                // Re-highlight new content blocks
                divelem.querySelectorAll('pre code').forEach(block => {
                  hljs.highlightElement(block);
                });
                // ID05142025.en

                box.scrollTop = box.scrollHeight;
              };

              const context = json.choices[0].delta.context;
              if (context) {
                if (!citations)
                  citations = context.citations;
                else
                  citations = citations.concat(context.citations);

                citLen = citations ? citations.length : 0;
                console.log(`streamCompletion(): No. of Citations: ${citLen}`);
              };
            }
          }
          catch (error) {
            // let chkdata = chkPart + pdata; ID10232024.o
            // chkPart = chkdata;
            chkPart = pdata; // ID10232024.n
          };

          // pdata = pdata.trim();
          /** if ( pdata.startsWith("{") && pdata.endsWith("}") && isMessageComplete(pdata) ) {
            console.log(`**** P-Data ****: ${pdata}`);
            chkPart = '';

            const json = JSON.parse(pdata);

            if (!json.choices || json.choices.length === 0)
              console.log("streamCompletion(): Skipping this line");
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
            chkPart = pdata; */
        });
      }; // end of while
      if (citLen > 0)
        divelem.innerHTML += insertCitationLinks(citations);

      // renderMarkdown(); // ID12022024.n; ID05142025.o

      if (calltime === 0) // If response was served from cache!
        calltime = Date.now() - sttime;

      let strResponse = {
        code: 200,
        message: "OK",
        time_to_first_token: (ttToken - sttime) / 1000,
        total_call_time: calltime / 1000,
        usage: usageInfo // ID02272025.n
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
      if ( status === 401 ) { // ID07102025.n
        let msg = "Authentication failed!  Please refer to the error details in the 'Exceptions' tab.";
        addMessageToBox(chatBox, 'mb-2 rounded bg-light text-danger', msg);
      }
      else if (data.error?.message?.includes("Thread")) { // ID11082024.n
        let msg = "Your session [ID = " + threadId + "] has expired.  Please start a new chat session.";
        addMessageToBox(box, 'mb-2 rounded bg-light text-info', msg);
      }
      else {
        let msg = "Received an exception from server.  Please refer to the error details in the 'Exceptions' tab.";
        addMessageToBox(box, 'mb-2 rounded bg-light text-danger', msg);
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

// ID02272025.sn
function getAiAppGatewaySessionsUri(appId, threadId) {
  const srvElem = document.getElementById('srvdropdown');
  const selectedIndex = srvElem.selectedIndex;
  const srvName = srvElem.options[selectedIndex].text;

  const srv_endpoint = aiGatewayMap.get(srvName).uri;

  return (`${srv_endpoint}/sessions/${appId}/${threadId}`);
}
// ID02272025.en

function getAiAppGatewayAppReqsUri(appId, requestId) { // ID11122024.n
  const srvElem = document.getElementById('srvdropdown');
  const selectedIndex = srvElem.selectedIndex;
  const srvName = srvElem.options[selectedIndex].text;

  const srv_endpoint = aiGatewayMap.get(srvName).uri;

  return (`${srv_endpoint}/requests/${appId}/${requestId}`); // ID02142025.n
}

function getAiAppGatewayLoadBalancerUri(appId) {
  // ID11132024.sn
  const srvElem = document.getElementById('srvdropdown');
  const selectedIndex = srvElem.selectedIndex;
  const srvName = srvElem.options[selectedIndex].text;

  let endpointUri = aiGatewayMap.get(srvName).uri + '/lb/' + appId;
  // ID11132024.en

  // let endpointUri = envContext.aisGtwyEndpoint + '/lb/' + appId; ID11132024.o
  if (document.getElementById("cache").checked)
    endpointUri += "?use_cache=false";

  return (endpointUri);
}

function checkIfAuthEnabled() { // ID02272025.n
  if ( isAuthEnabled ) {
    if ( !username ) { // ID11262024.n
      const loginBtn = document.getElementById('auth-anchor');

      let popover = new bootstrap.Popover(loginBtn, {
        animation: true,
        placement: "top",
        // title: "Alert",
        content: "Sign in to the AI App Gateway",
        trigger: "manual"
      });
      popover.show();
      setTimeout(function () { popover.dispose(); }, 2000);

      return(false);
    }
    else // ID11262024.n
      updateHeader("Sign-in"); // In case user is already logged in, change the header!  In case token has expired, user will be asked to re-auth again.
  };

  return(true);
}

async function sendMessage() {
  const aiSrvElem = document.getElementById('srvdropdown'); // ID11132024.n
  const aiSrv = aiSrvElem.options[aiSrvElem.selectedIndex].text;
  if (aiSrv === "Choose from") { // AI Application Gateway not selected

    let popover = new bootstrap.Popover(aiSrvElem, {
      animation: true,
      placement: "right",
      // title: "Alert",
      content: "Select an AI Application Gateway",
      trigger: "manual"
    });
    popover.show();
    setTimeout(function () { popover.dispose(); }, 2000);
    
    return;
  };
  if ( ! checkIfAuthEnabled() )
    return;

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
    // document.getElementById('spinnerBtn').style.display = "block"; ID02272025.o

    // ID02272025.n; Show spinner and change button text to 'Loading'
    document.getElementById('buttonText').textContent = 'Loading';
    document.getElementById('buttonSpinner').classList.remove('d-none');

    addMessageToBox(
      // document.getElementById('chatBox'),
      chatBox,
      'mb-2 rounded bg-secondary text-white',
      message);
    userInput.value = '';
    userInput.disabled = true;

    let sysPrompt = document.getElementById('sysPromptField').value;
    // if (!sysPrompt) // ID11012024.o
    // sysPrompt = defaultPrompt;

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

      if (sysPrompt) { // ID11012024.n
        /** ID02272025.so
        if ( aiAppObject.model_family ) // ID12202024.n; 'o1' model family doesn't support 'system' roles!
          promptObject.messages.push({ role: "developer", content: sysPrompt });
        else
          promptObject.messages.push({ role: "system", content: sysPrompt });
        */

        // ID02272025.sn
        const msgTypeElem = document.getElementById('msgtypedropdown');
        const msgType = msgTypeElem.options[msgTypeElem.selectedIndex].value;
      
        if ( msgType === "developer" ) // Developer message; required by reasoning models
          promptObject.messages.push({ role: "developer", content: sysPrompt });
        else if ( msgType === "system" ) // System message; ID08282025.n
          promptObject.messages.push({ role: "system", content: sysPrompt });
        // if msgType === "none" then do not send system message 
        // ID02272025.en
      };
      
      promptObject.messages.push({ role: "user", content: message });
    };

    const appId = aiAppObject.ai_app_name;
    const uri = getAiAppGatewayLoadBalancerUri(appId);
    if (isAuthEnabled) {
      const accessToken = await getToken();
      const bearer = `Bearer ${accessToken}`;
      // console.log(`Token: [${bearer}]`);
      requestHeaders.append('Authorization', bearer);
    };

    /** ID02272025.so
    // ID12202024.sn
    if ( aiAppObject.model_family ) { // 'o1' model family doesn't support these params!
      delete promptObject.temperature;
      delete promptObject.stop;
      delete promptObject.top_p;
      if ( promptObject.max_tokens ) {
        promptObject.max_completion_tokens = promptObject.max_tokens;
        delete promptObject.max_tokens;
      };
      promptObject.stream = false; // No streaming!
    }
    // ID12202024.en
    */

    if (promptObject.stream) { // Stream response ID02272025.n
      promptObject.stream_options = { include_usage: true }; // ID02272025.n
      await streamCompletion(aiSrv, uri, appId, requestHeaders, chatBox); // ID02272025.n
    }
    else {
      delete promptObject.stream_options; // ID02272025.n

      let status;
      try {
        const ds = promptObject.data_sources;
        if ( ds ) { // ID05142025.n; OYD call doesn't support 'max_completion_tokens' yet!
          promptObject.max_tokens = promptObject.max_completion_tokens;
          delete promptObject.max_completion_tokens;
        };

        if (threadId)
          delete promptObject.data_sources;
        const sttime = Date.now();
        let response = await fetch(uri, {
          method: "POST", headers: requestHeaders, body: JSON.stringify(promptObject)
        });
        if (threadId)
          promptObject.data_sources = ds;

        status = response.status; data = await response.json();
        const calltime = Date.now() - sttime;
        if (status === 200) {
          if (threadId === null) {
            threadId = response.headers.get("x-thread-id");
            const values = {
              ai_app_gateway: aiSrv,
              application_id: appId,
              thread_id: threadId,
              // user: aiAppObject.user, ID06062025.o
              user: isAuthEnabled ? username : uiUserName, // ID06062025.n
              endpoint_uri: uri,
              start_time: new Date().toLocaleString('en-US', { timeZoneName: 'short' })
            };
            /** ID02272025.o
            addJsonToBox(
              document.getElementById('infoBox'),
              'json-container',
              values);
            */
            if ( threadId ) // Add the thread only when enabled in server! ID02272025.n
              addJsonToThreadsTable(document.getElementById('infoBox'),values); // ID02272025.n
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
            data.choices[0].message.context,
            response.headers.get("x-request-id")); // ID09162025.n
        }
        else {
          if ( status === 401 ) { // ID07102025.n
            let msg = "Authentication failed!  Please refer to the error details in the 'Exceptions' tab.";
            addMessageToBox(chatBox, 'mb-2 rounded bg-light text-danger', msg);
          }
          else if (data.error.message?.includes("Thread")) {
            let msg = "Your session [ID = " + threadId + "] has expired.  Please start a new chat session.";
            addMessageToBox(chatBox, 'mb-2 rounded bg-light text-info', msg);
          }
          else {
            let msg = "Received an exception from server.  Please refer to the error details in the 'Exceptions' tab.";
            addMessageToBox(chatBox, 'mb-2 rounded bg-light text-danger', msg);
          };
          addJsonToBox(
            document.getElementById('errorBox'),
            'json-container',
            data); //Assuming data returned is JSON!
        };
      }
      catch (error) {
        const errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack
        };
        console.error('Fetch error:', errorDetails);
        addJsonToBox(
          document.getElementById('errorBox'),
          'json-container',
          errorDetails);
      };
    };
    // ID02272025.n; Hide spinner and change button text back to 'Send'
    document.getElementById('buttonText').textContent = 'Send';
    document.getElementById('buttonSpinner').classList.add('d-none');

    // document.getElementById('spinnerBtn').style.display = "none"; ID02272025.o
    document.getElementById('callApiBtn').disabled = false;
    document.getElementById('chatClearBtn').disabled = false;
    document.getElementById('msgClearBtn').disabled = false;
    document.getElementById('infoClearBtn').disabled = false;
    document.getElementById('errorClearBtn').disabled = false;
    userInput.disabled = false;
  }
}