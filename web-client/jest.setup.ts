// Jest Setup for RetailMind Web Client Test Harness
if (typeof global.crypto === 'undefined' || !global.crypto.randomUUID) {
  const crypto = require('crypto');
  global.crypto = crypto.webcrypto || crypto;
  if (!global.crypto.randomUUID) {
    global.crypto.randomUUID = () => crypto.randomUUID();
  }
}

