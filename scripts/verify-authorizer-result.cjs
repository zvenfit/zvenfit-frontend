'use strict';

const fs = require('node:fs');

function parseResult(input) {
  let result = JSON.parse(input);
  if (typeof result === 'string') {
    result = JSON.parse(result);
  }
  return result;
}

function verify(input, expected) {
  const result = parseResult(input);
  if (!result || result.isAuthorized !== expected) {
    throw new Error(`verify-authorizer-result: expected isAuthorized=${expected}`);
  }
  if (expected && (!result.context || result.context.environment !== 'staging')) {
    throw new Error('verify-authorizer-result: staging context is missing');
  }
}

if (require.main === module) {
  const expected = process.argv[2] === 'true';
  verify(fs.readFileSync(0, 'utf8'), expected);
  console.log(`verify-authorizer-result: isAuthorized=${expected}`);
}

module.exports = { parseResult, verify };
