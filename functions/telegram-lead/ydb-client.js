'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const { normalizeConnectionString, queryTimeoutMs, sessionPoolSize } = require('./ydb-config');

async function createYdbClient() {
  const [{ Driver }, { query }, { MetadataCredentialsProvider }, { Timestamp, Uint32 }] = await Promise.all([
    import('@ydbjs/core'),
    import('@ydbjs/query'),
    // eslint-disable-next-line import/no-unresolved -- package exports this runtime subpath
    import('@ydbjs/auth/metadata'),
    // eslint-disable-next-line import/no-unresolved -- package exports this runtime subpath
    import('@ydbjs/value/primitive'),
  ]);
  const connectionString = normalizeConnectionString(process.env.YDB_CONNECTION_STRING);
  let credentialsProvider = new MetadataCredentialsProvider();

  if (process.env.YDB_ACCESS_TOKEN_CREDENTIALS) {
    // eslint-disable-next-line import/no-unresolved -- package exports this runtime subpath
    const { EnvironCredentialsProvider } = await import('@ydbjs/auth/environ');
    credentialsProvider = new EnvironCredentialsProvider(connectionString);
  }

  const driver = new Driver(connectionString, { credentialsProvider });
  await driver.ready(AbortSignal.timeout(queryTimeoutMs()));

  const sql = query(driver, {
    poolOptions: { maxSize: sessionPoolSize() },
  });

  return {
    driver,
    sql,
    types: { Timestamp, Uint32 },
    async close() {
      await sql[Symbol.asyncDispose]?.();
      driver.close();
    },
  };
}

module.exports = { createYdbClient };
