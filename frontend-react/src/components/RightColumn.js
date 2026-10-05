// RightColumn.js
import React from 'react';

const RightColumn = () => {
  return (
    <div className="col-md-4">
				<nav>
					<div className="nav nav-tabs" id="nav-tab-config" role="tablist">
						<button className="nav-link active" id="nav-model-cfg-tab" data-bs-toggle="tab"
							data-bs-target="#nav-model-cfg" type="button" role="tab" aria-controls="nav-model-cfg"
							aria-selected="true">Model Config</button>
						<button className="nav-link" id="nav-search-cfg-tab" data-bs-toggle="tab"
							data-bs-target="#nav-search-cfg" type="button" role="tab"
							aria-controls="nav-search-cfg">Search Config</button>
					</div>
				</nav>
				<div className="tab-content" id="nav-tabContent-cfg">
					<div className="tab-pane fade show active" id="nav-model-cfg" role="tabpanel"
						aria-labelledby="nav-model-cfg-tab">
						<div className="p-2 border bg-light">
							<button id="modelCfgSaveBtn" className="btn btn-primary btn-sm" type="button"
								onclick="saveContent('modelConfig')">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-save" viewBox="0 0 16 16">
									<path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3.5 3.5a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L7.5 9.293V2a2 2 0 0 1 2-2H14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2.5a.5.5 0 0 1 0 1z"/>
								</svg>
								Save
							</button>

							<div className="position-fixed bottom-0 end-0 p-3" style={{zIndex: 11}}>
								<div id="modelConfigToast" className="toast hide" role="alert" aria-live="assertive"
									aria-atomic="true">
									<div className="toast-header">
										<strong className="me-auto">Status Message</strong>
										<small>Configuration</small>
										<button type="button" className="btn-close" data-bs-dismiss="toast"
											aria-label="Close"></button>
									</div>
									<div className="toast-body">
										Model configuration saved!
									</div>
								</div>
							</div>
						</div>
						<div className="border rounded p-3 mb-3" style={{height: "550px", overflowY: "auto"}} id="modelCfgBox">
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">User</span>
								<input id="uid" type="text" aria-label="User" disabled className="form-control" />
							</div>
							<div className="form-check">
								<input className="form-check-input" type="checkbox" value="" id="stream"/>
								<label className="form-check-label" for="stream">
									Stream
								</label>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Stop Sequence</span>
								<input id="stopSequence" type="text" aria-label="Stop Sequence" className="form-control" />
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Temperature</span>
								<input id="temperature" type="range" aria-label="Temperature" className="form-range" value="1.0" step="0.1" min="0.1" max="2" oninput="this.nextElementSibling.value = this.value" /><output id="temp_o"></output>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Max Tokens</span>
								<input id="mtokens" type="range" aria-label="Max Tokens" className="form-range" value="400" step="100" min="200" max="8192" oninput="this.nextElementSibling.value = this.value" /><output id="mtokens_o"></output>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Top P</span>
								<input id="topp" type="range" aria-label="Top P" className="form-range" value="1.0" step="0.1" min="0.1" max="1" oninput="this.nextElementSibling.value = this.value" /><output id="topp_o"></output>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Frequency Penalty</span>
								<input id="frequency" type="range" aria-label="Frequency Penalty" className="form-range" value="0" step="0.1" min="0" max="2" oninput="this.nextElementSibling.value = this.value" /><output id="freq_o"></output>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Performance Penalty</span>
								<input id="performance" type="range" aria-label="Performance Penalty" className="form-range" value="0" step="0.1" min="0" max="2" oninput="this.nextElementSibling.value = this.value" /><output id="perf_o"></output>
							</div>
						</div>
					</div>
					<div className="tab-pane fade" id="nav-search-cfg" role="tabpanel" aria-labelledby="nav-search-cfg-tab">
						<div className="p-2 border bg-light">
							<button id="searchCfgSaveBtn" className="btn btn-primary btn-sm" type="button"
								onclick="saveContent('searchConfig')">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-save" viewBox="0 0 16 16">
									<path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9.5a1 1 0 0 0-1 1v7.293l2.646-2.647a.5.5 0 0 1 .708.708l-3.5 3.5a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L7.5 9.293V2a2 2 0 0 1 2-2H14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h2.5a.5.5 0 0 1 0 1z"/>
								</svg>
								Save
							</button>
							<div className="position-fixed bottom-0 end-0 p-3" style={{zIndex: 11}}>
								<div id="srchConfigToast" className="toast hide" role="alert" aria-live="assertive"
									aria-atomic="true">
									<div className="toast-header">
										<strong className="me-auto">Status Message</strong>
										<small>Configuration</small>
										<button type="button" className="btn-close" data-bs-dismiss="toast"
											aria-label="Close"></button>
									</div>
									<div className="toast-body">
										Search configuration saved!
									</div>
								</div>
							</div>
						</div>
						<div className="border rounded p-3 mb-3" style={{height: "550px", overflowY: "auto"}} id="searchCfgBox">
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">AI Search App Name</span>
								<input id="searchAppName" type="text" aria-label="AI Search App Name" disabled className="form-control" />
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Endpoint</span>
								<input id="endpoint" type="text" aria-label="AI Search App Name" disabled className="form-control" />
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Index Name</span>
								<input id="indexName" type="text" aria-label="AI Search App Name" disabled className="form-control" />
							</div>
							<div className="form-check">
								<input className="form-check-input" type="checkbox" value="" id="scope" />
								<label className="form-check-label" for="scope">
									Scope
								</label>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Query Type</span>
								<select id="queryType" className="form-select">
									<option value="simple">simple</option>
									<option value="semantic">semantic</option>
									<option value="vector">vector</option>
									<option value="vector_simple_hybrid">vector_simple_hybrid</option>
									<option value="vector_semantic_hybrid">vector_semantic_hybrid</option>
								</select>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Embedding Model</span>
								<input id="embeddModel" type="text" aria-label="Embedding Model" disabled className="form-control" />
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Semantic Config</span>
								<input id="semConfig" type="text" aria-label="Semantic Config" className="form-control" />
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Strictness</span>
								<input id="strictness" type="range" aria-label="Strictness" className="form-range" value="3" step="1" min="1" max="5" oninput="this.nextElementSibling.value = this.value" /><output>3</output>
							</div>
							<div className="input-group input-group-sm mb-2">
								<span className="input-group-text">Documents</span>
								<input id="docs" type="range" aria-label="Documents" className="form-range" value="5" step="1" min="1" max="20" oninput="this.nextElementSibling.value = this.value" /><output>5</output>
							</div>
						</div>
					</div>
				</div>
			</div>
  );
};

export default RightColumn;
