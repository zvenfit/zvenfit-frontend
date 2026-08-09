'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const { runMigrations } = require('./lead-migrations');

runMigrations()
  .then(completed => {
    console.info(`YDB migrations complete; applied: ${completed.join(', ') || 'none'}`);
  })
  .catch(error => {
    console.error(`YDB migrations failed: ${error?.code || error?.name || 'unknown_error'}`);
    process.exitCode = 1;
  });
