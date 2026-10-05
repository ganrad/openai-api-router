import React from 'react';
import Header from './components/Header';
import LeftColumn from './components/LeftColumn';
import MiddleColumn from './components/MiddleColumn';
import RightColumn from './components/RightColumn';
import Footer from './components/Footer';

import { ai_app_config_file } from './constants/global-vars';

let aiAppConfig = new Map();

async function readAiAppConfig() {
  if (!ai_app_config_file) {
    const err = "AI Application Configuration file is null";
    console.error("Exiting due to exception:\n" + err);
    process.exit(1);
  };

  try {
    await fetch(ai_app_config_file)
      .then(response => response.text())
      .then(text => {
	console.log(`AI Config Filename:\n${ai_app_config_file}`);
	console.log(`Read Text:\n${text}`);
	const context = JSON.parse(text);
	    
	for (const app of context.ai_apps) {
	  console.log(`AI Application: ${app.ai_app_name}`);
	  aiAppConfig.set(app.ai_app_name,app);
	};
    });
  } catch (err) {
    console.error("Exiting due to exception:\n" + err);
    process.exit(1);
  }
}
await readAiAppConfig();

function App() {
  // aiAppConfig.forEach((value,key,map) => console.log(`App(): AI Application: ${key}`));
  return (
    <>
    <Header />
    <div class="container">
      <div class="row">
	<LeftColumn aiApps={aiAppConfig}/>
	<MiddleColumn />
	<RightColumn />
	<Footer />
      </div>
    </div>
    </>
  );
}

export default App;
