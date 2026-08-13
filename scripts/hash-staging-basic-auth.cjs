'use strict';

const { createHash } = require('node:crypto');

function credentialHash(environment = process.env) {
  const username = environment.STAGING_BASIC_AUTH_USERNAME || '';
  const password = environment.STAGING_BASIC_AUTH_PASSWORD || '';
  const isPrintableAscii = value => /^[\x21-\x7E]+$/.test(value);

  if (!isPrintableAscii(username) || username.includes(':')) {
    throw new Error('username must be printable ASCII without colon');
  }
  if (password.length < 32 || !isPrintableAscii(password)) {
    throw new Error('password must contain at least 32 printable ASCII characters without spaces');
  }

  return createHash('sha256').update(`${username}:${password}`, 'utf8').digest('hex');
}

if (require.main === module) {
  try {
    process.stdout.write(credentialHash());
  } catch (error) {
    console.error(`hash-staging-basic-auth: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

module.exports = { credentialHash };
