/**
 * @class: ToolConfigManager
 * @description: A centralized, thread-safe Singleton configuration manager for Node.js.
 * Stores and manages JSON configurations for multiple AI applications within an isolated 
 * Map structure, using the application names as unique keys.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 09-10-2026
 * Version (Introduced): 3.0.1
 * 
 * Key Features:
 * - Singleton Pattern: Enforced via Node.js module caching and constructor guards.
 * - Mutational Safety: Implements deep-cloning on get/set operations to protect internal state.
 * - Structural Immutability: Frozen object structure to prevent runtime tampering.
 * 
 *  Notes:
 * 
 */

class ToolConfigManager {
  constructor() {
    // Prevent instantiation via 'new' if an instance already exists
    if (ToolConfigManager.instance) {
      return ToolConfigManager.instance;
    }

    // Initialize the internal Map data structure
    this._configs = new Map();
    
    // Store the instance reference
    ToolConfigManager.instance = this;
    
    // Freeze the object to prevent modifications to the singleton structure
    Object.freeze(this);
  }

  /**
   * Sets the JSON configuration for a specific AI Application.
   * @param {string} appName - The unique name of the AI application.
   * @param {Object} configJSON - The JSON Tool configuration object.
   */
  set(appName, configJSON) {
    if (typeof appName !== 'string' || !appName.trim()) {
      throw new Error('Application name must be a valid non-empty string.');
    }
    if (typeof configJSON !== 'object' || configJSON === null) {
      throw new Error('Configuration must be a valid JSON object.');
    }
    
    // Deep clone the object to prevent external mutations from affecting the store
    const clonedConfig = JSON.parse(JSON.stringify(configJSON));
    this._configs.set(appName, clonedConfig);
  }

  /**
   * Retrieves the configuration for a specific AI Application.
   * @param {string} appName - The unique name of the AI application.
   * @returns {Object|undefined} A clone of the tool configuration object, or undefined if not found.
   */
  get(appName) {
    if (!this._configs.has(appName)) {
      return undefined;
    }
    
    // Deep clone on retrieval so consumers don't accidentally mutate the internal state
    return JSON.parse(JSON.stringify(this._configs.get(appName)));
  }

  /**
   * Checks if a configuration exists for an AI Application.
   * @param {string} appName 
   * @returns {boolean}
   */
  has(appName) {
    return this._configs.has(appName);
  }

  /**
   * Checks if the configuration manager contains any active application tool configs.
   * @returns {boolean} True if the internal map has at least one entry, false if empty.
   */
  isNotEmpty() {
    return this._configs.size > 0;
  }
}

// Instantiate the single instance
const instance = new ToolConfigManager();

// Export the instance, enforcing the Singleton pattern across Node.js
module.exports = instance;