import assert from 'node:assert/strict';
import test from 'node:test';

import * as config from '../config';

function withEnv(name: string, value: string, callback: () => void): void {
  const previous = process.env[name];
  process.env[name] = value;

  try {
    callback();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test('validates data, migration, and rate-limit table identifiers', () => {
  withEnv('YDB_LEADS_TABLE', 'leads_test', () => {
    assert.equal(config.tableName(), 'leads_test');
    assert.equal(config.migrationTableName(), 'leads_test_migrations');
  });

  withEnv('YDB_LEADS_TABLE', 'leads; DROP TABLE leads', () => {
    assert.throws(() => config.tableName(), /invalid_ydb_table_name/);
  });

  withEnv('YDB_RATE_LIMITS_TABLE', 'lead_limits_test', () => {
    assert.equal(config.rateLimitsTableName(), 'lead_limits_test');
  });

  withEnv('YDB_RATE_LIMITS_TABLE', 'limits; DROP TABLE leads', () => {
    assert.throws(() => config.rateLimitsTableName(), /invalid_ydb_rate_limits_table_name/);
  });
});

test('bounds the YDB session pool and applies timeout defaults', () => {
  withEnv('YDB_SESSION_POOL_SIZE', '500', () => assert.equal(config.sessionPoolSize(), 50));
  withEnv('YDB_QUERY_TIMEOUT_MS', 'invalid', () => assert.equal(config.queryTimeoutMs(), 5000));
  withEnv('YDB_SLOW_OPERATION_MS', '250', () => assert.equal(config.slowOperationMs(), 250));
});
