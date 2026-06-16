/**
 * Name: AI Gateway server event broker.
 * Description: A simple SSE based event broker which sends status/trace events to registered clients (UI)
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 05-20-2026
 * Version (Introduced): 3.0.1
 *
 * Notes:
 */

'use strict';
const { SseBrokerEvents } = require("./app-gtwy-constants.js");

const clients = new Map();      // sessionId -> response
const heartbeats = new Map();   // sessionId -> intervalId

function registerClient(sessionId, res) {
  if (!sessionId || !res) {
    throw new Error('registerClient requires sessionId and response object!');
  }

  // If a client already exists for this session, close the old one
  const existing = clients.get(sessionId);
  if (existing) {
    try {
      existing.end();
    } 
    catch (err) {
      // ignore
    };
    cleanupClient(sessionId);
  }

  clients.set(sessionId, res);

  // Optional keep-alive heartbeat (helps proxies / load balancers)
  const heartbeatId = setInterval(() => {
    try {
      res.write(`: ${SseBrokerEvents.HeartBeat}\n\n`);
    } 
    catch (err) {
      cleanupClient(sessionId);
    }
  }, 20000);

  heartbeats.set(sessionId, heartbeatId);
}

function cleanupClient(sessionId) {
  const heartbeatId = heartbeats.get(sessionId);
  if (heartbeatId) {
    clearInterval(heartbeatId);
    heartbeats.delete(sessionId);
  };

  clients.delete(sessionId);
}

function writeEvent(sessionId, eventName, payload = {}) {
  const res = clients.get(sessionId);
  if (!res) {
    return false; // no active listener; fail silently for minimalism
  };

  try {
    if (eventName) {
      res.write(`event: ${eventName}\n`);
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } 
  catch (err) {
    cleanupClient(sessionId);
    return false;
  }
}

function sendConnected(sessionId, payload = {}) {
  return writeEvent(sessionId, `${SseBrokerEvents.Connected}`, payload);
}

function sendStatus(sessionId, message) {
  return writeEvent(sessionId, `${SseBrokerEvents.Status}`, { message, ts: Date.now() });
}

function sendTrace(sessionId, message, meta = {}) {
  return writeEvent(sessionId, `${SseBrokerEvents.Trace}`, {
    message,
    ts: Date.now(),
    ...meta
  });
}

function sendError(sessionId, message) {
  return writeEvent(sessionId, `${SseBrokerEvents.Error}`, { message, ts: Date.now() });
}

function sendDone(sessionId, payload = {}) {
  return writeEvent(sessionId, `${SseBrokerEvents.Done}`, { ts: Date.now(), ...payload });
}

function closeStream(sessionId) {
  const res = clients.get(sessionId);
  if (res) {
    try {
      res.end();
    } 
    catch (err) {
      // ignore
    };
  }
  cleanupClient(sessionId);
}

function hasClient(sessionId) {
  return clients.has(sessionId);
}

module.exports = {
  registerClient,
  cleanupClient,
  sendConnected,
  sendStatus,
  sendTrace,
  sendError,
  sendDone,
  closeStream,
  hasClient
};