/**
 * Name: Display the AI Application metrics.
 * Description: This script contains the logic for retrieving AI App metrics and rendering the info. in a
 * modal dialog.
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-04-2025
 * Version (Introduced): v2.3.2:v1.3.0
 * Notes:
 * ID09162025: ganrad: v2.6.0-1.3.2: (Enhancements + Bugfixes) Introduced minor enhancements and made a few display related bug fixes.
 * ID09232025: ganrad: v2.6.0-1.3.2: (Bugfix) When AI App is switched by user, cache metrics were not reset properly. This issue has 
 * been fixed.
 * ID11212025: ganrad: v2.9.5-1.3.4: (Enhancement) The cache metrics are rendered in a html table.
 * ID12052025: ganrad: v2.9.6-1.3.5: (Enhancement) Added 'Refresh' button to the AI Application Metrics dialog to allow users to
 * refresh the metrics without closing and reopening the dialog.
 */

// Reset dialog fields when the modal is hidden (dialog is closed)
document.getElementById('metricsModalDialog').addEventListener('hidden.bs.modal', function () {
  document.getElementById('m_applicationId').textContent = '';
  document.getElementById('m_appType').textContent = '';
  document.getElementById('m_description').textContent = '';

  const tabs = document.getElementById('m_endpointMetricsTabs');
  tabs.innerHTML = '';
  tabs.style.display = 'flex'; // Reset to default state

  const content = document.getElementById('m_endpointMetricsContent');
  content.innerHTML = '';
  content.style.display = 'block'; // Reset to default state

  const noMetricsMessage = document.getElementById('noEndpointMetricsMessage');
  noMetricsMessage.style.display = 'none'; // Reset to hidden

  // Clear cache metrics
  document.getElementById('cacheMetricsContainer').innerHTML = '';
  document.getElementById('noCacheMetricsMessage').style.display = 'none';
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
    if (status === 200)  // Check for status 200 
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

  return (respJson);
}

// ID11212025.sn
function renderCacheMetrics(containerSelector, metrics, options = {}) {
  const container = document.querySelector(containerSelector);
  const noMetricsMessage = document.getElementById('noCacheMetricsMessage');

  if (!metrics || Object.keys(metrics).length === 0) {
    container.innerHTML = '';
    noMetricsMessage.style.display = 'block';
    return;
  }; // No metrics has been collected for this app Or Caching is disabled for this app
  noMetricsMessage.style.display = 'none';

  const decimals = Number.isInteger(options.decimals) ? options.decimals : 2;
  const latencyDecimals = Number.isInteger(options.latencyDecimals) ? options.latencyDecimals : 1;
  const tableClasses = options.tableClasses ||
    'table table-striped table-bordered table-sm table-hover align-middle mb-0';

  // Formatters
  const fmtPercent = (v) => `${(Number(v || 0) * 100).toFixed(decimals)}%`;
  const fmtNumber = (v) => Number(v ?? 0).toFixed(decimals);
  const fmtLatency = (v) => Number(v ?? 0).toFixed(latencyDecimals);

  // Build per-layer rows
  const rows = [
    {
      label: "L1 (In-Memory)",
      hits: metrics.counts.l1Hits,
      misses: metrics.counts.l1Misses,
      hitRate: metrics.hitRates.l1,
      avgScore: metrics.avgScores.l1,
      avgLatency: metrics.avgLatency.l1
    },
    {
      label: "L2 (Qdrant)",
      hits: metrics.counts.l2Hits,
      misses: metrics.counts.l2Misses,
      hitRate: metrics.hitRates.l2,
      avgScore: metrics.avgScores.l2,
      avgLatency: metrics.avgLatency.l2
    },
    {
      label: "L3 (PostgreSQL)",
      hits: metrics.counts.pgHits,
      // If you have pgMisses, set misses here; otherwise assume 0.
      misses: metrics.counts?.pgMisses ?? 0,
      // If metrics.hitRates doesn’t include Level3, compute it from hits/misses:
      hitRate: (metrics.hitRates?.pg ??
        ((metrics.counts.pgHits + (metrics.counts?.pgMisses ?? 0)) > 0
          ? metrics.counts.pgHits / (metrics.counts.pgHits + (metrics.counts?.pgMisses ?? 0))
          : 0)),
      avgScore: metrics.avgScores.pg,
      avgLatency: metrics.avgLatency.pg
    }
  ];

  // Create responsive wrapper with enhanced styling
  const wrapper = document.createElement('div');
  wrapper.className = 'table-responsive cache-metrics-table';

  // Create table
  const table = document.createElement('table');
  table.className = tableClasses;

  // THEAD
  const thead = document.createElement('thead');
  thead.className = 'table-light';
  const headerRow = document.createElement('tr');
  [
    'Layer',
    'Hits',
    'Misses',
    'Hit Rate',
    'Average Score',
    'Average Latency (ms)'
  ].forEach(text => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = text;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // TBODY
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = r.label;
    tr.appendChild(th);

    const tdHits = document.createElement('td');
    tdHits.textContent = r.hits;
    tr.appendChild(tdHits);

    const tdMisses = document.createElement('td');
    tdMisses.textContent = r.misses;
    tr.appendChild(tdMisses);

    const tdHitRate = document.createElement('td');
    const hitRateValue = r.hitRate;
    tdHitRate.textContent = fmtPercent(r.hitRate);
    tr.appendChild(tdHitRate);

    // Add color coding based on hit rate
    if (hitRateValue >= 0.8)
      tdHitRate.classList.add('text-success', 'fw-bold');
    else if (hitRateValue >= 0.5)
      tdHitRate.classList.add('text-warning', 'fw-bold');
    else
      tdHitRate.classList.add('text-danger', 'fw-bold');

    const tdAvgScore = document.createElement('td');
    tdAvgScore.textContent = fmtNumber(r.avgScore);
    tr.appendChild(tdAvgScore);

    const tdAvgLatency = document.createElement('td');
    tdAvgLatency.textContent = fmtLatency(r.avgLatency);
    tr.appendChild(tdAvgLatency);

    tbody.appendChild(tr);
  });

  // Assemble table
  table.appendChild(thead);
  table.appendChild(tbody);
  wrapper.appendChild(table);

  // Clear and inject into fieldset container
  container.innerHTML = '';
  container.appendChild(wrapper);
}
// ID11212025.en

function populateMetricsDialog(data) { // private
  document.getElementById('m_applicationId').textContent = data.applicationId;
  document.getElementById('m_appType').textContent = data.appType;
  document.getElementById('m_description').textContent = data.description;

  /** ID11212025.so
  if ( data.cacheMetrics ) { // If metrics object is not empty
    document.getElementById('m_cachehc').textContent = data.cacheMetrics.hitCount;
    document.getElementById('m_cacheavgscore').textContent = data.cacheMetrics.avgScore.toFixed(4); // ID09162025.n
  }
  else { // ID09232025.n
    document.getElementById('m_cachehc').textContent = 0;
    document.getElementById('m_cacheavgscore').textContent = 0.0;
  };
  ID11212025.eo */
  renderCacheMetrics('#cacheMetricsContainer', data.cacheMetrics); // ID11212025.n

  const tabs = document.getElementById('m_endpointMetricsTabs');
  const content = document.getElementById('m_endpointMetricsContent');
  const noMetricsMessage = document.getElementById('noEndpointMetricsMessage');


  // Always show the fieldset
  document.getElementById('endpointMetricsPanel').style.display = 'block';

  // Clear previous content
  tabs.innerHTML = '';
  content.innerHTML = '';

  // Check if endpoint metrics exist and have data
  if (!data.endpointMetrics || data.endpointMetrics.length === 0) {
    // Hide tabs and content, show message
    tabs.style.display = 'none';
    content.style.display = 'none';
    noMetricsMessage.style.display = 'block';
    return; // Exit early
  }

  // Show tabs and content, hide message
  tabs.style.display = 'flex';
  content.style.display = 'block';
  noMetricsMessage.style.display = 'none';

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
        reduce((acc, [_, value], index) => {
          acc[index] = value;
          return (acc);
        }, {});
    /* Object.entries(entries).map(([key, value]) => {
      console.log(key, value.collectionTime);
    }); */


    tabContent.innerHTML = `
      <div class="metric-summary mb-3">
        <div class="row g-2">
          <div class="col-md-4"><strong>Threads:</strong> ${endpoint.metrics.threadCount}</div>
          <div class="col-md-4"><strong>Total API Calls:</strong> ${endpoint.metrics.totalApiCalls}</div>
          <div class="col-md-4"><strong>Inference Tokens (K):</strong> ${endpoint.metrics.kInferenceTokens}</div>
        </div>
        <div class="row g-2 mt-1">
          <div class="col-md-4"><strong>Total Cost:</strong> $${endpoint.metrics.totalCost ?? 0}</div>
          <div class="col-md-4"><strong>Feedback Count:</strong> ${endpoint.metrics.feedbackCount}</div>
          <div class="col-md-4"><strong>Succeeded:</strong> ${endpoint.metrics.apiCalls}</div>
        </div>
        <div class="row g-2 mt-1">
          <div class="col-md-4"><strong>Failed:</strong> ${endpoint.metrics.failedApiCalls}</div>
          <div class="col-md-4"><strong>Throttled:</strong> ${endpoint.metrics.throttledApiCalls}</div>
          <div class="col-md-4"><strong>Filtered:</strong> ${endpoint.metrics.filteredApiCalls}</div>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-bordered table-sm table-hover mb-0">
          <thead>
            <tr>
              <th>Time Window</th>
              <th>Threads</th>
              <th>Total Calls</th>
              <th>Total Cost</th>
              <th>Feedback</th>
              <th>Succeeded</th>
              <th>Failed</th>
              <th>Throttled</th>
              <th>Filtered</th>
              <th>Tokens (K)</th>
              <th>TPM</th>
              <th>Avg Time (s)</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(entries).map(([key, value]) => `
              <tr>
                <td>${value.collectionTime}</td>
                <td>${value.collectedMetrics.threadCount}</td>
                <td>${value.collectedMetrics.totalApiCalls}</td>
                <td>$${value.collectedMetrics.totalCost ?? 0}</td>
                <td>${value.collectedMetrics.feedbackCount}</td>
                <td>${value.collectedMetrics.apiCalls}</td>
                <td>${value.collectedMetrics.failedApiCalls}</td>
                <td>${value.collectedMetrics.throttledApiCalls}</td>
                <td>${value.collectedMetrics.filteredApiCalls}</td>
                <td>${value.collectedMetrics.throughput.kTokensPerWindow}</td>
                <td>${value.collectedMetrics.throughput.tokensPerMinute}</td>
                <td>${value.collectedMetrics.latency.avgResponseTimeSec}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    content.appendChild(tabContent);
  });
}

async function refreshMetrics() { // ID12052025.n 
  const aiSrvElem = document.getElementById('srvdropdown');
  const aiGtwy = aiSrvElem.options[aiSrvElem.selectedIndex].text;

  if (!aiGtwy || aiGtwy === "Choose from") {
    console.warn("No AI Gateway selected. Cannot refresh metrics.");
    return;
  }

  const aiAppElem = document.getElementById('appdropdown');
  const aiApp = aiAppElem.options[aiAppElem.selectedIndex].text;

  if (!aiApp || aiApp === "Choose from") {
    console.warn("No AI Application selected. Cannot refresh metrics.");
    return;
  }

  // Optional: show loading spinner or disable button
  const refreshBtn = document.getElementById('refreshMetricsBtn');
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Refreshing...';

  try {
    const aiAppObject = await fetchAiAppMetrics(aiApp);
    if (aiAppObject.status === 200) {
      populateMetricsDialog(aiAppObject.data);
    } else {
      console.error("Failed to refresh metrics:", aiAppObject.errors);
    }
  } 
  catch (error) {
    console.error("Error refreshing metrics:", error);
  } 
  finally {
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Refresh';
  };
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
    if (aiAppObject.status === 200) {
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