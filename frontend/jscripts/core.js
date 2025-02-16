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
 * ID12202024: ganrad: v2.1.0-v1.1.0: (Enhancement) Updated code to support 'o1' family of models.
 * ID02142025: ganrad: v2.2.0-v1.1.0: (API consistency) Updated '/apirouter/apprequests' endpoint to '/apirouter/requests'.
*/
// Adjust the system prompt as needed
const defaultPrompt = "You are a helpful AI Assistant trained by OpenAI."; // Default prompt

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

function setInferenceTarget() {
  const aiAppElem = document.getElementById('appdropdown');
  const aiApp = aiAppElem.options[aiAppElem.selectedIndex].text;

  aiAppObject = aiAppConfig.get(aiApp);

  // Set the system prompt
  if (aiAppObject.sysPrompt)
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
  document.getElementById("cache").checked = false; // ID10232024.n

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
    promptObject.max_tokens = Number(document.getElementById("mtokens").value);
    promptObject.temperature = Number(document.getElementById("temperature").value);
    promptObject.presence_penalty = Number(document.getElementById("presence").value);
    promptObject.frequency_penalty = Number(document.getElementById("frequency").value);
    let value = document.getElementById("stopSequence").value; // ID11082024.n
    if ((value !== "undefined") && value)
      promptObject.stop = value;
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
  element.innerHTML = '<h2 class="accordion-header" id="headingOne"><button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">' +
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

async function callAppRequestsApi(uri) { // ID11122024.sn
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
    let response = await fetch(uri, {method: "GET", headers: headers});

    status = response.status;
    data = await response.json();
  }
  catch (e) {
    console.warn(`callAppRequestsApi(): Status: ${status}, URI: ${uri},\nException: ${e}`);
  };
  if ( status === 200 ) {
    // Open a new tab
    const newTab = window.open();

    // Write the data to the new tab
    newTab.document.write(`<pre>${JSON.stringify(data,null,2)}</pre>`);

    // Close the document to finish loading the content
    newTab.document.close();
  }
  else
    console.warn(`callAppRequestsApi(): Status: ${status}, URI: ${uri}`);
} // ID11122024.en

function addJsonToAccordian(time, box, cls, accordian, req, res, reqId) { // ID11122024.sn
  const element = document.createElement('div');
  element.className = "accordian-item";
  let ct = '<h2 class="accordion-header" id="headingOne"><button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="true" aria-controls="collapseOne">' +
    new Date().toLocaleString('en-US', { timeZoneName: 'short' }) + ' (' + (time / 1000) + ' seconds)' +
    '</button></h2><div id="collapseOne" class="accordion-collapse collapse show" aria-labelledby="headingOne" data-bs-parent="#msgAccordian"><div class="accordion-body">';
  if ( isAuthEnabled )
    ct += '<p><b>Request: </b>(ID = <a href="#" onclick="callAppRequestsApi(\'' + getAiAppGatewayAppReqsUri(aiAppObject.ai_app_name,reqId) + '\'); return false;"' +
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

function addMessageToChatBox(box, cls, msg, ctx) { // ID12022024.sn
  const element = document.createElement('div');
  element.className = cls;

  // console.log(`Message before: ${msg}`);
  let content = msg;

  let refList = '<ul class="list-group">';
  let docNo = 1;
  if (ctx) {
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
  };

  const contentElem = document.createElement('pre');
  // Add styles for wrapping words
  contentElem.style.whiteSpace = 'pre-wrap';
  contentElem.style.overflowWrap = 'break-word';

  const mdElem = document.createElement('md');
  mdElem.innerHTML = content;
  contentElem.appendChild(mdElem);

  element.appendChild(contentElem);

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

  box.appendChild(element);
  box.scrollTop = box.scrollHeight;
  renderMarkdown();
} // ID12022024.en

function isMessageComplete(message) {
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
* Stream OpenAI completion
* @param{string} prompt
* @param{any} parameters
*/
async function streamCompletion(uri, appId, hdrs, box) {
  try {
    const ds = promptObject.data_sources;
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
      // const element = document.createElement('p'); ID12022024.o
      const preElim = document.createElement('pre'); // ID12022024.sn
      // Add styles for wrapping words
      preElim.style.whiteSpace = 'pre-wrap';
      preElim.style.overflowWrap = 'break-word';

      const element = document.createElement('md');
      preElim.appendChild(element); // ID12022024.en

      divelem.className = 'mb-2 rounded bg-light text-dark';
      // divelem.appendChild(element); ID12022024.o
      divelem.appendChild(preElim); // ID12022024.n

      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) return;
      // console.log("step-2");
      box.appendChild(divelem);
      // eslint-disable-next-line no-constant-condition
      let chkPart = '';
      let calltime = 0;
      let ttToken = 0;
      let citations = null;
      let citLen = 0;
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) break;
        if (!ttToken) ttToken = Date.now();

        // console.log(`Raw line: ${value}`);
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

            if (!json.choices || json.choices.length === 0)
              console.log("streamCompletion(): Skipping this line");
            else {
              const msg = json.choices[0].delta.content;
              if (msg) {
                const citLen = citations ? citations.length : 0;
                // let content = msg.replace(/(?:\r\n|\r|\n)/g, '<br>'); // Get rid of all the newlines ID12022024.o
                let content = msg; // ID12022024.n
                if (citLen > 0) {
                  for (let i = 1; i <= citLen; i++)
                    content = content.replaceAll("[doc" + i + "]", "<sup>[" + i + "]</sup>");
                }
                element.innerHTML += content;
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

      renderMarkdown(); // ID12022024.n

      if (calltime === 0) // If response was served from cache!
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
      if (data.error?.message?.includes("Thread")) { // ID11082024.n
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
      return;
    }
    else // ID11262024.n
      updateHeader("Sign-in"); // In case user is already logged in, change the header!  In case token has expired, user will be asked to re-auth again.
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

      if (sysPrompt) // ID11012024.n
        if ( aiAppObject.model_family ) // ID12202024.n; 'o1' model family doesn't support 'system' roles!
          promptObject.messages.push({ role: "developer", content: sysPrompt });
        else
          promptObject.messages.push({ role: "system", content: sysPrompt });
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

    if (promptObject.stream) // Stream response
      await streamCompletion(uri, appId, requestHeaders, chatBox);
    else {
      let status;
      try {
        const ds = promptObject.data_sources;

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
          if (data.error.message?.includes("Thread")) {
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
    document.getElementById('spinnerBtn').style.display = "none";
    document.getElementById('callApiBtn').disabled = false;
    document.getElementById('chatClearBtn').disabled = false;
    document.getElementById('msgClearBtn').disabled = false;
    document.getElementById('infoClearBtn').disabled = false;
    document.getElementById('errorClearBtn').disabled = false;
    userInput.disabled = false;
  }
}