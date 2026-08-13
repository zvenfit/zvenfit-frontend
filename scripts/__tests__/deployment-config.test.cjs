'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { PRODUCTION, STAGING, readConfig, validateConfig } = require('../validate-deployment-config.cjs');

function environmentConfig(environment, values) {
  return {
    DEPLOYMENT_ENVIRONMENT: environment,
    SITE_URL: values.siteUrl,
    S3_BUCKET: values.s3Bucket,
    LEAD_FUNCTION_NAME: values.leadFunctionName,
    SCHEDULE_FUNCTION_NAME: values.scheduleFunctionName,
    LEAD_RETRY_TRIGGER_NAME: values.leadRetryTriggerName,
    YDB_DATABASE_NAME: values.ydbDatabaseName,
    ALLOWED_ORIGINS: values.allowedOrigins.join(','),
  };
}

test('accepts the exact production and staging resource maps', () => {
  assert.equal(validateConfig(readConfig(environmentConfig('production', PRODUCTION))).environment, 'production');
  assert.equal(validateConfig(readConfig(environmentConfig('staging', STAGING))).environment, 'staging');
});

test('rejects a production database accidentally passed to staging', () => {
  const env = environmentConfig('staging', STAGING);
  env.YDB_DATABASE_NAME = PRODUCTION.ydbDatabaseName;

  assert.throws(() => validateConfig(readConfig(env)), /staging ydbDatabaseName must be zvenfit-leads-staging/);
});

test('rejects a production origin accidentally passed to staging', () => {
  const env = environmentConfig('staging', STAGING);
  env.ALLOWED_ORIGINS = PRODUCTION.allowedOrigins.join(',');

  assert.throws(() => validateConfig(readConfig(env)), /staging ALLOWED_ORIGINS/);
});

test('rejects unsupported environments, insecure origins and duplicate origins', () => {
  const unsupported = readConfig(environmentConfig('preview', STAGING));
  assert.throws(() => validateConfig(unsupported), /unsupported environment preview/);

  const insecure = environmentConfig('staging', STAGING);
  insecure.SITE_URL = 'http://staging.zvenfit.ru';
  assert.throws(() => readConfig(insecure), /SITE_URL must be an HTTPS origin/);

  const duplicate = environmentConfig('staging', STAGING);
  duplicate.ALLOWED_ORIGINS = 'https://staging.zvenfit.ru,https://staging.zvenfit.ru';
  assert.throws(() => readConfig(duplicate), /contains duplicates/);
});
