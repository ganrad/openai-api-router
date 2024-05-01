/**
 * Name: AzAiTranslatorEpMetrics
 * Description: This class collects Azure AI Translator API endpoint metrics and stores them
 * in a light-weight data structure (~ Queue).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-24-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const Queue = require('./queue');
const { EndpointMetricsConstants, TranslatorAPIKind } = require('./app-gtwy-constants');

class AzAiTranslatorEpMetrics {

  constructor(endpoint,interval,count) {
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful API calls

    this.langApiCalls = 0; // No. of successful calls - List languages
    this.translateApiCalls = 0; // No. of successful calls - translate
    this.transliterateApiCalls = 0; // No. of successful calls - transliteration
    this.detectApiCalls = 0; // No. of successful calls - detect language
    this.sentenceApiCalls = 0; // No. of successful calls - break sentence
    this.dictApiCalls = 0; // No. of successful calls - dictionary ~ lookup / examples

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
      case TranslatorAPIKind.Language:
	this.langApiCalls++;
	break;
      case TranslatorAPIKind.Translate:
	this.translateApiCalls++;
	break;
      case TranslatorAPIKind.Transliterate:
	this.transliterateApiCalls++;
	break;
      case TranslatorAPIKind.Detect:
	this.detectApiCalls++;
	break;
      case TranslatorAPIKind.BrkSentence:
	this.sentenceApiCalls++;
	break;
      case TranslatorAPIKind.Dictionary:
	this.dictApiCalls++;
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
          languageApiCalls: this.langApiCalls,
          translateApiCalls: this.translateApiCalls,
          transliterateApiCalls: this.transliterateApiCalls,
          detectApiCalls: this.detectApiCalls,
          breakSentenceApiCalls: this.sentenceApiCalls,
          dictionaryApiCalls: this.dictApiCalls,
          failedApiCalls: this.failedApiCalls,
          totalApiCalls: this.totalApiCalls,
	  latency: {
            avgResponseTimeMsec: latency
	  }
        }
      };
      this.historyQueue.enqueue(his_obj);

      this.apiCalls = 0;
      this.langApiCalls = 0;
      this.translateApiCalls = 0;
      this.transliterateApiCalls = 0;
      this.detectApiCalls = 0;
      this.sentenceApiCalls = 0;
      this.dictApiCalls = 0;
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
      languageApiCalls: this.langApiCalls,
      translateApiCalls: this.translateApiCalls,
      transliterateApiCalls: this.transliterateApiCalls,
      detectApiCalls: this.detectApiCalls,
      breakSentenceApiCalls: this.sentenceApiCalls,
      dictionaryApiCalls: this.dictApiCalls,
      failedApiCalls: this.failedApiCalls,
      totalApiCalls: this.totalApiCalls,
      history: this.historyQueue.queueItems
    };
  }
}
module.exports = AzAiTranslatorEpMetrics;
