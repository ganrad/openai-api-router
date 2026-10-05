// middle-col.js
import React from 'react';

const MiddleColumn = () => {
  return (
    <div className="col-md-6">
      <nav>
	<div className="nav nav-tabs" id="nav-tab" role="tablist">
	  <button className="nav-link active" id="nav-chat-tab" data-bs-toggle="tab" data-bs-target="#nav-chat" type="button" role="tab" aria-controls="nav-chat" aria-selected="true">Chat</button>
	  <button className="nav-link" id="nav-info-tab" data-bs-toggle="tab" data-bs-target="#nav-info" type="button" role="tab" aria-controls="nav-info" aria-selected="false">Info</button>
	  <button className="nav-link" id="nav-msg-tab" data-bs-toggle="tab" data-bs-target="#nav-msg" type="button" role="tab" aria-controls="nav-msg" aria-selected="false">Messages (Raw)</button>
	  <button className="nav-link" id="nav-error-tab" data-bs-toggle="tab" data-bs-target="#nav-error" type="button" role="tab" aria-controls="nav-error" aria-selected="false">Exceptions</button>
	</div>
      </nav>
				<div className="tab-content" id="nav-tabContent">
					<div className="tab-pane fade show active" id="nav-chat" role="tabpanel" aria-labelledby="nav-chat-tab">
						<div className="p-2 border bg-light">
							<button id="chatClearBtn" className="btn btn-primary btn-sm" type="button"
								onclick="clearContent('chatBox')">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
									className="bi bi-x-square" viewBox="0 0 16 16">
									<path
										d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z" />
									<path
										d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
								</svg>
								Clear chat
							</button>
						</div>
						<div className="border rounded p-3 mb-3" style={{height: "450px", overflowY: "auto"}} id="chatBox">
						</div>
						<div className="input-group">
							<textarea id="userInput" className="form-control" rows="3"
								placeholder="Enter your query here"></textarea>
							<button id="callApiBtn" className="btn btn-primary btn-sm" type="button"
								onclick="sendMessage()">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
									className="bi bi-send" viewBox="0 0 16 16">
									<path
										d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76z" />
								</svg>
								Send
							</button>
						</div>
						<div className="bg-light">
							<button id="spinnerBtn" className="btn btn-primary btn-sm" style={{display: "none"}} type="button"
								disabled>
								<span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
								Loading...
							</button>
						</div>
					</div>
					<div className="tab-pane fade" id="nav-msg" role="tabpanel" aria-labelledby="nav-msg-tab">
						<div className="p-2 border bg-light">
							<button id="msgClearBtn" className="btn btn-primary btn-sm" type="button"
								onclick="clearContent('msgBox')">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
									className="bi bi-x-square" viewBox="0 0 16 16">
									<path
										d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z" />
									<path
										d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
								</svg>
								Clear messages
							</button>
						</div>
						<div className="border rounded p-3 mb-3" style={{height: "550px", overflowY: "auto"}} id="msgBox">
							<div className="accordion" id="msgAccordian">
							</div>
						</div>
					</div>
					<div className="tab-pane fade" id="nav-info" role="tabpanel" aria-labelledby="nav-info-tab">
						<div className="p-2 border bg-light">
							<button id="infoClearBtn" className="btn btn-primary btn-sm" type="button"
								onclick="clearContent('infoBox')">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
									className="bi bi-x-square" viewBox="0 0 16 16">
									<path
										d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z" />
									<path
										d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
								</svg>
								Clear info
							</button>
						</div>
						<div className="border rounded p-3 mb-3" style={{height: "550px", overflowY: "auto"}} id="infoBox">
						</div>
					</div>
					<div className="tab-pane fade" id="nav-error" role="tabpanel" aria-labelledby="nav-error-tab">
						<div className="p-2 border bg-light">
							<button id="infoClearBtn" className="btn btn-primary btn-sm" type="button"
								onclick="clearContent('errorBox')">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor"
									className="bi bi-x-square" viewBox="0 0 16 16">
									<path
										d="M14 1a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2z" />
									<path
										d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
								</svg>
								Clear errors
							</button>
						</div>
						<div className="border rounded p-3 mb-3" style={{height: "550px", overflowY: "auto"}} id="errorBox">
						</div>
					</div>
				</div>
			</div>
  );
};

export default MiddleColumn;
