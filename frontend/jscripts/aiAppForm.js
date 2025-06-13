/**
 * Name: SPA UI/Frontend core logic for RAPID.
 * Description: This script contains the core logic for creating and deploying an AI App on the AI App Gateway
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-27-2025
 * Version (Introduced): v2.3.0:v1.2.0
 * 
 * Notes:
 * ID04302025: ganrad: v2.3.2-v1.3.0: Introduced new fields - applyAffinity and endpoint id.
 * ID05142025: ganrad: v2.3.8-v1.3.0: Introduced fields for personalization / long term user memory feature.
 */
let priorityCounter = 0; // Endpoint uri priority counter

// When user clicks deploy 'AI Application' -
document.getElementById('aiAppDeployLink').addEventListener('click', function(event) {
  event.preventDefault(); // Prevent the default anchor behavior

  if ( ! checkIfAuthEnabled() ) // If Auth is enabled, user should be logged in!
    return;

  // Check if user has selected an Ai App Gateway!
  const aiSrvElem = document.getElementById('srvdropdown');
  const aiGtwy = aiSrvElem.options[aiSrvElem.selectedIndex].text;

  if ( aiGtwy && ( aiGtwy !== "Choose from") ) {
    const aiAppModal = new bootstrap.Modal(document.getElementById('aiAppDeployModal'));
    aiAppModal.show();
  }
  else {
    console.log('Condition not met. Ai Application Deploy modal dialog will not open!');
  };
});

// Disable all cache related attributes when user disables semantic cache
document.getElementById('useCache').addEventListener('change', function() {
  const inputs = document.querySelectorAll('#searchType, #searchDistance, #term, #includeRoles, #entryExpiryCache');
  inputs.forEach(input => {
      input.disabled = !this.checked;
  });
});

// Disable all memory attributes when user disables state management
document.getElementById('useMemory').addEventListener('change', function() {
  const inputs = document.querySelectorAll('#msgCount, #entryExpiryMemory, #applyAffinity'); // ID04302025.n
  inputs.forEach(input => {
      input.disabled = !this.checked;
  });
});

// Disable all personalization attributes when user disables long term user memory ID05142025.n
document.getElementById('enableLongTermMemory').addEventListener('change', function() {
  const inputs = document.querySelectorAll('#extractionPrompt, #factsAppName, #generateFollowups, #followUpPrompt');
  inputs.forEach(input => {
      input.disabled = !this.checked;
  });

  /**
  const factAppElem = document.getElementById('factsAppName');
  if ( this.checked )
    factAppElem.required = true;
  else
    factAppElem.required = false;
  */
});

// Reset form fields when the modal is hidden (form is closed)
document.getElementById('aiAppDeployModal').addEventListener('hidden.bs.modal', function () {
  priorityCounter = 0; // Reset the endpoints table idx counter

  // Reset the endpoints table
  const table = document.getElementById('endpointsTable');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = ''; // empty the endpoints table body

  // Reset the form
  let form = document.getElementById('aiAppForm');
  form.reset();
  form.classList.remove('was-validated');
  var inputs = form.querySelectorAll('.form-control');
  inputs.forEach(function (input) {
    input.classList.remove('is-valid', 'is-invalid');
  });
});

// Validate the 'uri' field as soon as user inputs it!
document.getElementById('uri').addEventListener('input', function () {
  let uriField = document.getElementById('uri');
  if (uriField.checkValidity()) {
    uriField.classList.remove('is-invalid');
    uriField.classList.add('is-valid');
  } else {
    uriField.classList.remove('is-valid');
    uriField.classList.add('is-invalid');
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const appDeployModel = document.getElementById('aiAppDeployModal');
  const noRowsMessage = document.getElementById('noRowsMessage');
  const table = document.getElementById('endpointsTable');

  function assignServerId() {
    const aiSrvElem = document.getElementById('srvdropdown');
    const aiGtwy = aiSrvElem.options[aiSrvElem.selectedIndex].text;
    const gtwyType = document.getElementById("srvtype").value;
    
    document.getElementById("gatewayId").value = aiGtwy;
    document.getElementById("gatewayType").value = gtwyType;
  }

  function checkTableRows() {
    const rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) {
        noRowsMessage.style.display = 'block';
    } else {
        noRowsMessage.style.display = 'none';
    }
  }

  function updatePriorities() {
    const rows = table.querySelectorAll('tbody tr');
    console.log(`UP() Rows: ${rows.length}`);
    for (let i = 0; i < rows.length; i++)
      rows[i].cells[0].innerText = i;
    priorityCounter = rows.length;
  }

  // Execute this function when user clicks on 'addEndpoint' button
  document.getElementById('addEndpoint').addEventListener('click', function() {

    const uri = document.getElementById('uri').value;
    let form = document.querySelector('.needs-validation');
    if ( !form.checkValidity() ) {
      // Form is invalid, prevent default action and show validation feedback
      form.classList.add('was-validated');
      return;
    };
    const apiKey = document.getElementById('apikey').value;
    if (!uri || !apiKey)
      return;
    const epid = document.getElementById('epId').value; // ID04302025.n

    const rpm = document.getElementById('rpm').value;

    const tbody = table.querySelector('tbody');
    const newRow = document.createElement('tr');
    newRow.innerHTML = `<td>${priorityCounter++}</td><td>${epid}</td><td>${rpm}</td><td>${uri}</td><td style="display: none;">${apiKey}</td>`; // ID04302025.n
    newRow.innerHTML += '<td><button type="button" class="btn btn-danger btn-sm deleteRow">Delete</button></td>';
    tbody.appendChild(newRow);
    checkTableRows();

    // Reset field values
    document.getElementById('uri').value = '';
    document.getElementById('apikey').value = '';
    document.getElementById('rpm').value = 0;
    document.getElementById('epId').value = '';
  });

  table.addEventListener('click', (event) => {
    if (event.target.classList.contains('deleteRow')) {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length > 1) {
        event.target.closest('tr').remove();
        updatePriorities();
        checkTableRows();
      } else {
        alert('At least one AI Service endpoint URI is required!');
      }
    }
  });

  appDeployModel.addEventListener('show.bs.modal', function() {
    assignServerId();
    checkTableRows();
  });
});

function getAiAppGatewayUri() { // public
  const srvElem = document.getElementById('srvdropdown');
  const selectedIndex = srvElem.selectedIndex;
  const srvName = srvElem.options[selectedIndex].text;
  
  const srv_endpoint = aiGatewayMap.get(srvName).uri;
  
  return (srv_endpoint);
}

async function callAiAppGatewayApi(appObject) { // private
  const aiAppDeployUri = getAiAppGatewayUri() + "/cp/AiApplication/deploy";
  let requestHdrs = new Headers(hdrs);
  requestHdrs.append('Content-Type', "application/json");

  if (isAuthEnabled) {
    const accessToken = await getToken();
    const bearer = `Bearer ${accessToken}`;
    // console.log(`Token: [${bearer}]`);
    requestHdrs.append('Authorization', bearer);
  };

  let respJson;
  const tstatus = document.getElementById('toastStatus');
  try {
    const response = await fetch(aiAppDeployUri, {
      method: "POST", headers: requestHdrs, body: JSON.stringify(appObject)
    });
    const status = response.status;
    const data = await response.json();
    if ( (status === 200) || (status === 201) )  { // Check for status 200 / 201 ~ updated / created!
      respJson = data;
      tstatus.innerHTML = "<span class='text-success'>" + "SUCCESS" + "</span>";
    }
    else {
      respJson = {
        status: status,
        errors: data
      };
      tstatus.innerHTML = "<span class='text-danger'>" + "FAILED" + "</span>";
    };
  }
  catch (error) {
    respJson = {
      status: 500, // Server connection error
      errors: {
        message: error.message,
        name: error.name,
        stack: error.stack
      }
    };
    tstatus.innerHTML = "<span class='text-danger'>" + "FAILED" + "</span>";
    console.log(`callAiAppGatwayApi(): Encountered exception\n  ${respJson}`);
  };

  return(respJson);
}

function populateToastTable(data) { // private
  const tableBody = document.getElementById('jsonTableBody');
  // empty the tbody 
  tableBody.innerHTML = '';

  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const row = document.createElement('tr');
      const keyCell = document.createElement('td');
      const valueCell = document.createElement('td');

      keyCell.textContent = key;
      if ( typeof data[key] === 'object' )
        valueCell.innerHTML = '<div><pre class="json-container">' + prettyPrintJson.toHtml(data[key]) + '</pre></div>';
      else
        valueCell.textContent = data[key];

      row.appendChild(keyCell);
      row.appendChild(valueCell);
      tableBody.appendChild(row);
    }
  };
}

async function registerAiAppInServer(payload) { // private
  let ret_val = false;
  let requestHdrs = new Headers(hdrs);
  requestHdrs.append('Content-Type', "application/json");

  try {
    const response = await fetch(serverUriPrefix.concat("registerapp"), {
      method: "POST", headers: requestHdrs, body: JSON.stringify(payload)
    });
    const status = response.status;
    const data = await response.json();
    if ( (status === 200) )  // Check for status 200 ~ OK
      ret_val = true;
    else
      console.log(`registerAiAppInServer(): Encountered exception while registering AI App in Frontend server.  Check server logs.\n  ${data}`);
  }
  catch (error) {
    console.log(`registerAiAppInServer(): Encountered exception. Check server logs.\n  ${error}`);
  };

  return(ret_val);
}

async function registerAiApp(appId,desc) { // private
  let appRegistered = 0; // Failed

  // First check to see if the Ai App already exists
  const aiSrvElem = document.getElementById('srvdropdown');
  const aiGtwy = aiSrvElem.options[aiSrvElem.selectedIndex].text;
  if ( ! aiGatewayConfig.get(aiGtwy).get(appId) ) { // is this a new AI Application ?
    const req_body = {
      aiGateway: aiGtwy,
      aiAppDef: {
        ai_app_name: appId,
        description: desc,
        user: "rapid",
        sysPrompt: "You are a helpful AI Assistant.",
        model_params: {
          temperature: 0.1,
          max_tokens: 1000,
          top_p: 0.1,
          stream: false,
          stop: "",
          frequency_penalty: 0,
          presence_penalty: 0
        }
      }
    };
    console.log(`Sending Payload:\n ${JSON.stringify(req_body,null,2)}`);

    // Register Ai App in frontend (UI) server
    const st = await registerAiAppInServer(req_body);
    if ( st ) {
      // Update in-memory cache with new Ai App definition -
      aiGatewayConfig.get(aiGtwy).set(appId,req_body.aiAppDef);
      setAiApps();

      appRegistered = 1; // Registered
    };
  }
  else
    appRegistered = 2; // Already registered

  return(appRegistered);
}

// This function is executed when user clicks on 'Deploy' AI app on the modal form.
async function deployAiApplication() {
  let table = document.getElementById('endpointsTable');

  let form = document.querySelector('.needs-validation');
  // Is form valid -
  if (form.checkValidity()) {
    console.log('Form is valid');

    // 0. Check if endpoints table is populated; if not return
    if ( table.querySelectorAll('tbody tr').length === 0 ) {
      const noRowsMessage = document.getElementById('noRowsMessage');
      noRowsMessage.style.display = 'block';

      return;
    };
    
    // const spinnerOverlay = document.getElementById('spinnerOverlay');
    // spinnerOverlay.classList.remove('d-none'); // Display the busy icon ...

    // 1. Create the AiApplication JSON object
    const appTypeElem = document.getElementById('appType');
    const aiAppType = appTypeElem.options[appTypeElem.selectedIndex].value;  // Use 'text' to test exception scenario

    let cacheObject = new Object();
    const useCache = document.getElementById('useCache');
    if ( useCache.checked ) {
      cacheObject.useCache = true;
      const srchTypeElem = document.getElementById('searchType');
      cacheObject.searchType = srchTypeElem.options[srchTypeElem.selectedIndex].value;
      cacheObject.searchDistance = parseInt(document.getElementById('searchDistance').value);
      const srchContentObject = new Object();
      const srchTermElem = document.getElementById('term');
      srchContentObject.term = srchTermElem.options[srchTermElem.selectedIndex].value;
      srchContentObject.includeRoles = document.getElementById('includeRoles').value;
      cacheObject.searchContent = srchContentObject;
      cacheObject.entryExpiry = document.getElementById('entryExpiryCache').value;
    }
    else
      cacheObject.useCache = false;

    let memoryObject = new Object();
    const useMemory = document.getElementById('useMemory');
    if (useMemory.checked) {
      const affinity = document.getElementById('applyAffinity'); // ID04302025.n
      memoryObject.affinity = affinity.checked;

      memoryObject.useMemory = true;
      memoryObject.msgCount = parseInt(document.getElementById('msgCount').value);
      memoryObject.entryExpiry = document.getElementById('entryExpiryMemory').value;
    }
    else {
      memoryObject.useMemory = false;
      memoryObject.affinity = false;
    };

    // ID05142025.sn
    let longTermMemObject = new Object();
    const useLtMemory = document.getElementById('enableLongTermMemory');
    if (useLtMemory.checked) {
      longTermMemObject.userMemory = true;
      const followups = document.getElementById('generateFollowups');
      longTermMemObject.generateFollowupMsgs = followups.checked;

      longTermMemObject.userFactsAppName = document.getElementById('factsAppName').value;
      longTermMemObject.extractionPrompt = document.getElementById('extractionPrompt').value;
      longTermMemObject.followupPrompt = document.getElementById('followUpPrompt').value;
    }
    else
      longTermMemObject.userMemory = false;
    // ID05142025.en

    let endpointsArray = new Array();
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row, rowIndex) => {
      let endpointObj = new Object();

      const cells = row.querySelectorAll('td');
      endpointObj.id = cells[1].textContent; // ID04302025.n
      endpointObj.rpm = parseInt(cells[2].textContent);
      endpointObj.uri = cells[3].textContent;
      endpointObj.apikey = cells[4].textContent;
      // console.log(`Priority: ${rowIndex}, Uri: ${endpointObj.uri}`);
      
      endpointsArray.push(endpointObj);
    });

    let aiAppObj = {
      appId: document.getElementById('appId').value,
      description: document.getElementById('description').value,
      appType: aiAppType,
      searchAiApp: document.getElementById('searchAiApp').value,
      cacheSettings: cacheObject,
      memorySettings: memoryObject,
      personalizationSettings: longTermMemObject, // ID05142025.n
      endpoints: endpointsArray
    };
    console.log(`AI Application:\n ${JSON.stringify(aiAppObj, null, 2)}`);

    // 2. Call Ai App Gateway CP API to post the new Ai App definition
    const responseObj = await callAiAppGatewayApi(aiAppObj);
    console.log(`AI App Gateway Response:\n ${JSON.stringify(responseObj, null, 2)}`);
    // spinnerOverlay.classList.add('d-none'); // Hide the spinner overlay (busy icon)

    // 3. Register Ai App Definition with Frontend (UI) server
    if ( ! responseObj.errors ) {
      const rval = await registerAiApp(aiAppObj.appId, aiAppObj.description);
      switch ( rval ) {
        case 0:
          responseObj.appRegistration = "FAILED";
          break;
        case 1:
          responseObj.appRegistration = "SUCCEEDED";
          break;
        default:
          responseObj.appRegistration = "NO_ACTION";
      };
    };

    // 4. Close the Ai App Deploy modal dialog
    let modal = bootstrap.Modal.getInstance(document.getElementById('aiAppDeployModal'));
    modal.hide();

    // 5. Display toast containing Rapid API response -
    const alert = document.getElementById('aiAppDeployToast'); //select id of toast
    populateToastTable(responseObj);
    const bsAlert = new bootstrap.Toast(alert); //initialize it
    bsAlert.show(); //show it
  }
  else {
    // Form is invalid, prevent default action and show validation feedback
    form.classList.add('was-validated');
  };
}