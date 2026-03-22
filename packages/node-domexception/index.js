'use strict';
// Re-export the platform-native DOMException available in Node 18+.
// This local shim replaces the deprecated `node-domexception` npm package
// (which instructs: "Use your platform's native DOMException instead").
module.exports = globalThis.DOMException;
