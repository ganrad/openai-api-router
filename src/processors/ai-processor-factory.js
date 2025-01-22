/**
 * Name: AI processor factory
 * Description: A factory class that instantiates AI service processors / AI orchestration engines
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 * ID05032024: ganrad: Added traffic routing support for Azure AI Content Safety service APIs
 * ID09042024: ganrad: Added routing support for AI orchestration engines
 * ID11052024: ganrad: v2.1.0: (Enhancement) Added support for LLMs which use Azure AI Model Inference API (Chat completion).
*/

const AzOaiProcessor = require("./az-oai-processor.js");
const AzAiSearchProcessor = require("./az-ai-search-processor.js");
const AzAiSvcProcessor = require("./az-ai-svc-processor.js");
const AzAiTranslatorProcessor = require("./az-ai-translator-processor.js");
const AiAppEngine = require("./ai-app-engine"); // ID09042024.n
const { AzAiServices, AiWorkflowEngines } = require("../utilities/app-gtwy-constants.js"); // ID09042024.n

class AiProcessorFactory {

  constructor() { // Singleton 
    if (!AiProcessorFactory.instance)
      AiProcessorFactory.instance = this;

    return AiProcessorFactory.instance;
  }

  getProcessor(appType) {
    let processor = null;

    switch (appType) {
      case AzAiServices.OAI:
      case AzAiServices.AzAiModelInfApi: // ID11052024.n
        processor = new AzOaiProcessor();
        break;
      case AzAiServices.AiSearch:
        processor = new AzAiSearchProcessor();
        break;
      case AzAiServices.Language:
      case AzAiServices.ContentSafety:
        processor = new AzAiSvcProcessor();
        break;
      case AzAiServices.Translator:
        processor = new AzAiTranslatorProcessor();
        break;
      case AiWorkflowEngines.SeqAiEngine: // ID09042024.n
        processor = new AiAppEngine();
        break;
      default:
        processor = null;
    };

    return processor;
  }
}

module.exports = AiProcessorFactory;