/**
 * Name: Display the AI Application metrics.
 * Description: This script contains the logic for retrieving AI App metrics and rendering the info. in a
 * modal dialog.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-04-2025
 * Version (Introduced): v2.3.2:v1.3.0
 * 
 */

// Reset dialog fields when the modal is hidden (dialog is closed)
document.getElementById('metricsModalDialog').addEventListener('hidden.bs.modal', function () {
  document.getElementById('m_applicationId').textContent = '';
  document.getElementById('m_appType').textContent = '';
  document.getElementById('m_description').textContent = '';

  const tabs = document.getElementById('m_endpointMetricsTabs');
  tabs.innerHTML = '';
  const content = document.getElementById('m_endpointMetricsContent');
  content.innerHTML = '';
});

async function fetchAiAppMetrics(aiApp) { // private
  const aiAppMetricsUri = getAiAppGatewayUri() + "/metrics/" + aiApp;
  let requestHdrs = new Headers(hdrs);
  requestHdrs.append('Content-Type', "application/json");

  if (isAuthEnabled) {
    const accessToken = await getToken();
    const bearer = `Bearer ${accessToken}`;
    // console.log(`Token: [${bearer}]`);
    requestHdrs.append('Authorization', bearer);
  };

  let respJson;
  try {
    const response = await fetch(aiAppMetricsUri, {
      method: "GET", headers: requestHdrs
    });
    const status = response.status;
    const data = await response.json();
    if ( status === 200 )  // Check for status 200 
      respJson = {
        status: status,
        data: data
      };
    else {
      respJson = {
        status: status,
        errors: data
      };
      console.log(`fetchAiAppMetrics(): Encountered exception\n  ${respJson}`);
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
    console.log(`fetchAiAppMetrics(): Encountered exception\n  ${respJson}`);
  };

  return(respJson);
}

function populateMetricsDialog(data) { // private
  document.getElementById('m_applicationId').textContent = data.applicationId;
  document.getElementById('m_appType').textContent = data.appType;
  document.getElementById('m_description').textContent = data.description;

  if ( data.cacheMetrics ) { // If metrics object is not empty
    document.getElementById('m_cachehc').textContent = data.cacheMetrics.hitCount;
    document.getElementById('m_cacheavgscore').textContent = data.cacheMetrics.avgScore;
  };

  const tabs = document.getElementById('m_endpointMetricsTabs');
  const content = document.getElementById('m_endpointMetricsContent');

  data.endpointMetrics.forEach((endpoint, index) => {
    const isActive = (index === 0) ? 'active' : '';
    const isShowActive = (index === 0) ? 'show active' : '';
    const contentId = (endpoint.id ?? "Priority") + `-(${endpoint.priority})`;

    // Create tab
    const tab = document.createElement('li');
    tab.className = 'nav-item';
    tab.innerHTML = `
      <a class="nav-link ${isActive}" id="${contentId}-tab" data-bs-toggle="tab" href="#${contentId}" role="tab" aria-controls="${contentId}" aria-selected="${index === 0}">${contentId}</a>
      `;
    tabs.appendChild(tab);

    // Create tab content
    const tabContent = document.createElement('div');
    tabContent.className = `tab-pane fade ${isShowActive}`;
    // tabContent.id = `priority-${endpoint.priority}`;
    tabContent.id = contentId;
    tabContent.role = 'tabpanel';
    tabContent.ariaLabelledby = `${contentId}-tab`;

    // Reverse entries so they are in desc. order of time -
    // const entries = Object.entries(endpoint.metrics.history)
    let entries = 
      Object.entries(endpoint.metrics.history).
        reverse().
        reduce((acc, [_,value], index) => {
          acc[index] = value;
          return(acc);
        }, {});
    /* Object.entries(entries).map(([key, value]) => {
      console.log(key, value.collectionTime);
    }); */

    tabContent.innerHTML = `
      <div class="container mt-1">
        <div class="row">
          <div class="col-md-4"><strong>Threads:</strong> ${endpoint.metrics.threadCount}</div>
          <div class="col-md-4"><strong>Total API Calls:</strong> ${endpoint.metrics.totalApiCalls}</div>
          <div class="col-md-4"><strong>Inference Tokens (K):</strong> ${endpoint.metrics.kInferenceTokens}</div>
        </div>
        <div class="row mt-1">
          <div class="col-md-4"><strong>Succeeded:</strong> ${endpoint.metrics.apiCalls}</div>
          <div class="col-md-4"><strong>Failed:</strong> ${endpoint.metrics.failedApiCalls}</div>
          <div class="col-md-4"><strong>Throttled:</strong> ${endpoint.metrics.throttledApiCalls}</div>
        </div>
        <div class="row mt-1">
          <div class="col-md-4"><strong>Filtered:</strong> ${endpoint.metrics.filteredApiCalls}</div>
        </div>
        <table class="table table-bordered mt-3">
            <thead style="position: sticky; top: 0; background-color: white; z-index: 1;">
                <tr>
                    <th>Time Window</th>
                    <th>Threads</th>
                    <th>Total API Calls</th>
                    <th>Succeeded</th>
                    <th>Failed</th>
                    <th>Throttled</th>
                    <th>Filtered</th>
                    <th>Total Tokens (K)</th>
                    <th>Tokens Per Minute</th>
                    <th>Avg Response Time (ms)</th>
                </tr>
            </thead>
            <tbody>
              ${Object.entries(entries).map(([key, value]) => `
                <tr>
                  <td>${value.collectionTime}</td>
                  <td>${value.collectedMetrics.threadCount}</td>
                  <td>${value.collectedMetrics.totalApiCalls}</td>
                  <td>${value.collectedMetrics.apiCalls}</td>
                  <td>${value.collectedMetrics.failedApiCalls}</td>
                  <td>${value.collectedMetrics.throttledApiCalls}</td>
                  <td>${value.collectedMetrics.filteredApiCalls}</td>
                  <td>${value.collectedMetrics.throughput.kTokensPerWindow}</td>
                  <td>${value.collectedMetrics.throughput.tokensPerMinute}</td>
                  <td>${value.collectedMetrics.latency.avgResponseTimeMsec}</td>
                </tr>
              `).join('')}
            </tbody>
        </table>
      </div>
    `;
    content.appendChild(tabContent);
  });
}

function getTestData() { // private
  const data = {
    "applicationId": "app-id",
    "appType": "azure_oai",
    "description": "An AI Assistant / Chatbot application which uses gpt-4o (Omni) mini model for answering GK questions. The model is deployed in multiple US regions for scalability.",
    "cacheMetrics": {
      hitCount: 20,
      avgScore: 0.98
    },
    // "endpointMetrics": []
    "endpointMetrics": [
      {
        "endpoint": "https://deployment/endpoint-0",
        "id": "gpt-4o-useast",
        "priority": 0,
        "metrics": {
          "apiCalls": 1,
          "failedApiCalls": 0,
          "throttledApiCalls": 0,
          "filteredApiCalls": 0,
          "totalApiCalls": 1,
          "threadCount": 20,
          "kInferenceTokens": 540,
          "history": {
            "0": {
              "collectionTime": "4/3/2025, 6:59:13 PM",
              "collectedMetrics": {
                "apiCalls": 2,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 2,
                "threadCount": 10,
                "throughput": {
                  "kTokensPerWindow": 229,
                  "tokensPerMinute": 114.5
                },
                "latency": {
                  "avgResponseTimeMsec": 1654.5
                }
              }
            },
            "1": {
              "collectionTime": "4/3/2025, 7:10:15 PM",
              "collectedMetrics": {
                "apiCalls": 1,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 1,
                "threadCount": 2,
                "throughput": {
                  "kTokensPerWindow": 138,
                  "tokensPerMinute": 69
                },
                "latency": {
                  "avgResponseTimeMsec": 1481
                }
              }
            }
          }
        }
      },
      {
        "endpoint": "https://deployment/endpoint-1",
        "id": "gpt-4o-useast2",
        "priority": 1,
        "metrics": {
          "apiCalls": 5,
          "failedApiCalls": 0,
          "throttledApiCalls": 0,
          "filteredApiCalls": 0,
          "totalApiCalls": 5,
          "threadCount": 15,
          "kInferenceTokens": 2240,
          "history": {
            "0": {
              "collectionTime": "4/3/2025, 6:59:13 PM",
              "collectedMetrics": {
                "apiCalls": 2,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 2,
                "threadCount": 4,
                "throughput": {
                  "kTokensPerWindow": 229,
                  "tokensPerMinute": 114.5
                },
                "latency": {
                  "avgResponseTimeMsec": 1654.5
                }
              }
            },
            "1": {
              "collectionTime": "4/3/2025, 7:10:15 PM",
              "collectedMetrics": {
                "apiCalls": 1,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 1,
                "threadCount": 25,
                "throughput": {
                  "kTokensPerWindow": 138,
                  "tokensPerMinute": 69
                },
                "latency": {
                  "avgResponseTimeMsec": 1481
                }
              }
            },
            "2": {
              "collectionTime": "4/3/2025, 6:59:13 PM",
              "collectedMetrics": {
                "apiCalls": 2,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 2,
                "threadCount": 21,
                "throughput": {
                  "kTokensPerWindow": 229,
                  "tokensPerMinute": 114.5
                },
                "latency": {
                  "avgResponseTimeMsec": 1654.5
                }
              }
            },
            "3": {
              "collectionTime": "4/3/2025, 6:59:13 PM",
              "collectedMetrics": {
                "apiCalls": 2,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 2,
                "threadCount": 22,
                "throughput": {
                  "kTokensPerWindow": 229,
                  "tokensPerMinute": 114.5
                },
                "latency": {
                  "avgResponseTimeMsec": 1654.5
                }
              }
            },
            "4": {
              "collectionTime": "4/3/2025, 6:59:13 PM",
              "collectedMetrics": {
                "apiCalls": 2,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 2,
                "threadCount": 23,
                "throughput": {
                  "kTokensPerWindow": 229,
                  "tokensPerMinute": 114.5
                },
                "latency": {
                  "avgResponseTimeMsec": 1654.5
                }
              }
            },
            "5": {
              "collectionTime": "4/3/2025, 6:59:13 PM",
              "collectedMetrics": {
                "apiCalls": 2,
                "failedApiCalls": 0,
                "throttledApiCalls": 0,
                "filteredApiCalls": 0,
                "totalApiCalls": 2,
                "threadCount": 24,
                "throughput": {
                  "kTokensPerWindow": 229,
                  "tokensPerMinute": 114.5
                },
                "latency": {
                  "avgResponseTimeMsec": 1654.5
                }
              }
            }
          }
        }
      }
    ]
  };
  return ({ status: 200, data: data });
}

// When user clicks fetch 'AI Application Metrics' on the console -
async function retrieveAiAppMetrics() {

  if (!checkIfAuthEnabled()) // If Auth is enabled, user should be logged in!
    return;

  // Check if user has selected an Ai App Gateway!
  const aiSrvElem = document.getElementById('srvdropdown');
  const aiGtwy = aiSrvElem.options[aiSrvElem.selectedIndex].text;

  if (aiGtwy && (aiGtwy !== "Choose from")) {
    const aiAppElem = document.getElementById('appdropdown');
    const aiApp = aiAppElem.options[aiAppElem.selectedIndex].text;

    const aiAppObject = await fetchAiAppMetrics(aiApp);
    // const aiAppObject = getTestData();
    if ( aiAppObject.status === 200 ) {
      // console.log(`retrieveAiAppMetrics(): Data\n  ${JSON.stringify(aiAppObject, null, 2)}`);
      populateMetricsDialog(aiAppObject.data);

      const aiAppModal = new bootstrap.Modal(document.getElementById('metricsModalDialog'));
      aiAppModal.show();
    }
  }
  else {
    console.log('Condition not met. Ai Application Metrics modal dialog will not open!');
  };
}