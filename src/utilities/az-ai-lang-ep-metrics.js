/**
 * Name: AzAiLanguageEpMetrics
 * Description: This class collects Azure AI Language API endpoint metrics and stores them
 * in a light-weight data structure (~ Queue).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-19-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const Queue = require('./queue');
const { EndpointMetricsConstants } = require('./app-gtwy-constants');

class AzAiLanguageEpMetrics {
  static LanguageAPI = {
    LD: "LanguageDetection",
    NER: "EntityRecognition",
    KPE: "KeyPhraseExtraction",
    EL: "EntityLinking",
    SA: "SentimentAnalysis",
    PII: "PiiEntityRecognition"
  }

  constructor(endpoint,interval,count) {
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful API calls

    this.ldApiCalls = 0; // No. of successful calls - Language Detection
    this.nerApiCalls = 0; // No. of successful calls - Named Entity Recognition
    this.kpeApiCalls = 0; // No. of successful calls - Key Phrase Extraction
    this.elApiCalls = 0; // No. of successful calls -  Entity Linking
    this.saApiCalls = 0; // No. of successful calls - Sentiment Analysis and Opinion Mining
    this.piierApiCalls = 0; // No. of successful calls - Pii Entity Recognition

    this.failedApiCalls = 0; // No. of failed calls ~ 429's, 400's ...
    this.totalApiCalls = 0; // Total calls handled by this target endpoint

    this.timeMarker = Date.now(); // Time marker used to check if endpoint is unhealthy

    if ( interval )
      this.cInterval = Number(interval); // Metrics collection interval
    else
      this.cInterval = EndpointMetricsConstants.DEF_METRICS_C_INTERVAL;

    if ( count )
      this.hStack = Number(count); // Metrics history cache count
    else
      this.hStack = EndpointMetricsConstants.DEF_METRICS_H_COUNT;
    // console.log(`\n  Endpoint:  ${this.endpoint}\n  Cache Interval (minutes): ${this.cInterval}\n  History Count: ${this.hStack}`);
    logger.log({level: "info", message: "[%s] %s.constructor():\n  Endpoint: %s\n  Cache Interval (minutes): %d\n  History Count: %d", splat: [scriptName,this.constructor.name,this.endpoint,this.cInterval,this.hStack]});

    this.startTime = Date.now();
    this.endTime = this.startTime + (this.cInterval * 60 * 1000);

    this.respTime = 0; // Average api call response time for a cInterval
    this.historyQueue = new Queue(count); // Metrics history cache (fifo queue)
  }

  isEndpointHealthy() {
    let currentTime = Date.now();

    let isAvailable = currentTime >= this.timeMarker;
    let retrySecs = isAvailable ? 0 : (this.timeMarker - currentTime) / 1000;
    return [isAvailable, retrySecs];
  }

  updateApiCalls(kind, latency) {
    this.updateMetrics();

    this.respTime += latency;
    this.apiCalls++;
    switch ( kind ) {
      case AzAiLanguageEpMetrics.LanguageAPI.LD:
	this.ldApiCalls++;
	break;
      case AzAiLanguageEpMetrics.LanguageAPI.NER:
	this.nerApiCalls++;
	break;
      case AzAiLanguageEpMetrics.LanguageAPI.KPE:
	this.kpeApiCalls++;
	break;
      case AzAiLanguageEpMetrics.LanguageAPI.EL:
	this.elApiCalls++;
	break;
      case AzAiLanguageEpMetrics.LanguageAPI.SA:
	this.saApiCalls++;
	break;
      case AzAiLanguageEpMetrics.LanguageAPI.PII:
	this.piierApiCalls++;
	break;
    };
    this.totalApiCalls++;
  }

  updateFailedCalls(retrySeconds) {
    this.updateMetrics();

    this.timeMarker = Date.now() + (retrySeconds * 1000);
    this.failedApiCalls++;
    this.totalApiCalls++;
  }

  updateMetrics() {
    let ctime = Date.now();

    if ( ctime > this.endTime ) {
      let sdate = new Date(this.startTime).toLocaleString();
      let latency = (this.respTime > 0) ? (this.respTime / this.apiCalls) : 0;
      
      let his_obj = {
        collectionTime: sdate,
        collectedMetrics : {
          apiCalls: this.apiCalls,
          languageDetectionApiCalls: this.ldApiCalls,
          namedEntityRecognitionApiCalls: this.nerApiCalls,
          keyPhraseExtractionApiCalls: this.kpeApiCalls,
          entityLinkingApiCalls: this.elApiCalls,
          sentimentAnalysisApiCalls: this.saApiCalls,
          piiEntityRecognitionApiCalls: this.piierApiCalls,
          failedApiCalls: this.failedApiCalls,
          totalApiCalls: this.totalApiCalls,
	  latency: {
            avgResponseTimeMsec: latency
	  }
        }
      };
      this.historyQueue.enqueue(his_obj);

      this.apiCalls = 0;
      this.ldApiCalls = 0;
      this.nerApiCalls = 0;
      this.kpeApiCalls = 0;
      this.elApiCalls = 0;
      this.saApiCalls = 0;
      this.piierApiCalls = 0;
      this.failedApiCalls = 0;
      this.totalApiCalls = 0;
      this.respTime = 0;

      this.startTime = Date.now();
      this.endTime = this.startTime + (this.cInterval * 60 * 1000);
    };
  }

  toJSON() {
    return {
      apiCalls: this.apiCalls,
      languageDetectionApiCalls: this.ldApiCalls,
      namedEntityRecognitionApiCalls: this.nerApiCalls,
      keyPhraseExtractionApiCalls: this.kpeApiCalls,
      entityLinkingApiCalls: this.elApiCalls,
      sentimentAnalysisApiCalls: this.saApiCalls,
      piiEntityRecognitionApiCalls: this.piierApiCalls,
      failedApiCalls: this.failedApiCalls,
      totalApiCalls: this.totalApiCalls,
      history: this.historyQueue.queueItems
    };
  }
}
module.exports = AzAiLanguageEpMetrics;
