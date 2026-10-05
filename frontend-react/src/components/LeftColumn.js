// left-col.js
import { useState } from 'react';

let aiAppConfig = null;

function GetAiApp(props) {
  return <option>{props.appName}</option>;
}

function setInferenceTarget(aiApp) {
  // console.log(`setInf(): AI App: ${aiApp}`);

  let aiAppObject = aiAppConfig.get(aiApp);
  document.getElementById("descField").innerHTML = aiAppObject.description;
  document.getElementById("uid").value = aiAppObject.user;
  document.getElementById("stopSequence").value = aiAppObject.model_params.stop_sequence;
  document.getElementById("temperature").value = aiAppObject.model_params.temperature;
  document.getElementById("temp_o").value = aiAppObject.model_params.temperature;
  document.getElementById("mtokens").value = aiAppObject.model_params.max_tokens;
  document.getElementById("mtokens_o").value = aiAppObject.model_params.max_tokens;
  document.getElementById("frequency").value = aiAppObject.model_params.frequency_penalty;
  document.getElementById("freq_o").value = aiAppObject.model_params.frequency_penalty;
  document.getElementById("performance").value = aiAppObject.model_params.performance_penalty;
  document.getElementById("perf_o").value = aiAppObject.model_params.performance_penalty;
  document.getElementById("topp").value = aiAppObject.model_params.top_p;
  document.getElementById("topp_o").value = aiAppObject.model_params.top_p;
}

function LeftColumn(props) {
  aiAppConfig = props.aiApps;

  const sysPmpt = "You are a helpful AI Assistant trained by OpenAI.";
  let aiApps = [];
  let idx = 1;

  props.aiApps.forEach((value,key,map) => {
    // console.log(`LeftColumn(): ${key}`)
    const app = { id: idx, aiApp: key };
    aiApps.push(app);
    idx++;
  });

  return (
    <>
    <div className="col-md-2">
      <div className="mb-2">
	<label for="appdropdown" className="form-label"><b>AI Application</b></label>
	<select id="appdropdown" className="form-select" onChange={(e) => setInferenceTarget(e.target.value)}>
	  <option selected="selected">Choose from</option>
	  {aiApps.map((app) => <GetAiApp key={app.id} appName={app.aiApp} />)}
	</select>
      </div>
      <div className="mb-2">
	<label className="form-label"><b>Description</b></label>
	<div className="border rounded p-3 mb-2" style={{height: "200px", overflowY: "auto"}} id="descField">
	</div>
      </div>
      <div className="mb-2">
	<label className="form-label"><b>System Prompt</b></label>
	<textarea id="sysPromptField" style={{resize: "none"}} className="form-control" rows="10">{sysPmpt}</textarea>
      </div>
    </div>
    </>
  );
}

export default LeftColumn;
