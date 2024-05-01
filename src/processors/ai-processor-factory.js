/**
 * Name: AI processor factory
 * Description: A factory class that instantiates AI service processors
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 *
*/

const AzOaiProcessor = require("./az-oai-processor.js");
const AzAiSearchProcessor = require("./az-ai-search-processor.js");
const AzAiSvcProcessor = require("./az-ai-svc-processor.js");
const AzAiTranslatorProcessor = require("./az-ai-translator-processor.js");
const { AzAiServices } = require("../utilities/app-gtwy-constants.js");

class AiProcessorFactory {

  constructor() { // Singleton 
    if (! AiProcessorFactory.instance)
      AiProcessorFactory.instance = this;

    return AiProcessorFactory.instance;
  }
 
  getProcessor(appType) {
    let processor = null;

    switch (appType) {
      case AzAiServices.OAI:
        processor = new AzOaiProcessor();
        break;
      case AzAiServices.AiSearch:
	processor = new AzAiSearchProcessor();
	break;
      case AzAiServices.Language:
        processor = new AzAiSvcProcessor();
        break;
      case AzAiServices.Translator:
        processor = new AzAiTranslatorProcessor();
	break;
      default:
        processor = null;
    };

    return processor;
  }
}

module.exports = AiProcessorFactory;
