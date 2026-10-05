/**
 * Name: Misc Helper Classes
 * Description: This script contains misc. helper classes.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Version (Introduced): v3.0.1
 * Date: 06-24-2026
 *
 * Notes:
 */

class AiApiError extends Error {
  constructor(message, apiType, { status, type, body } = {}) {
    super(message);
    this.name = apiType;
    this.status = status;
    this.type = type;
    this.body = body;
  }
}

module.exports = {
  AiApiError
}