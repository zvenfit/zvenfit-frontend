'use strict';

const PRODUCTION = Object.freeze({
  siteUrl: 'https://zvenfit.ru',
  s3Bucket: 'zvenfit-frontend',
  leadFunctionName: 'zvenfit-telegram-lead',
  scheduleFunctionName: 'zvenfit-fitbase-schedule',
  leadRetryTriggerName: 'zvenfit-lead-telegram-retry',
  ydbDatabaseName: 'zvenfit-leads',
  allowedOrigins: ['https://zvenfit.ru', 'https://www.zvenfit.ru', 'https://zvenigorod.zvenfit.ru'],
  siteAccessMode: 'public',
  gatewayName: 'disabled',
  authorizerFunctionName: 'disabled',
});

const STAGING = Object.freeze({
  siteUrl: 'https://staging.zvenfit.ru',
  s3Bucket: 'zvenfit-frontend-staging',
  leadFunctionName: 'zvenfit-telegram-lead-staging',
  scheduleFunctionName: 'zvenfit-fitbase-schedule-staging',
  leadRetryTriggerName: 'zvenfit-lead-telegram-retry-staging',
  ydbDatabaseName: 'zvenfit-leads-staging',
  allowedOrigins: ['https://staging.zvenfit.ru'],
  siteAccessMode: 'authenticated-gateway',
  gatewayName: 'zvenfit-staging',
  authorizerFunctionName: 'zvenfit-staging-authorizer',
});

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`deployment-config: ${name} is required`);
  }

  return normalized;
}

function normalizedOrigin(value, name) {
  const url = new URL(required(value, name));
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`deployment-config: ${name} must be an HTTPS origin without path, query or hash`);
  }

  return url.origin;
}

function parseOrigins(value) {
  const origins = required(value, 'ALLOWED_ORIGINS')
    .split(',')
    .map(origin => normalizedOrigin(origin, 'ALLOWED_ORIGINS'));

  if (new Set(origins).size !== origins.length) {
    throw new Error('deployment-config: ALLOWED_ORIGINS contains duplicates');
  }

  return origins;
}

function readConfig(env = process.env) {
  return {
    environment: required(env.DEPLOYMENT_ENVIRONMENT, 'DEPLOYMENT_ENVIRONMENT'),
    siteUrl: normalizedOrigin(env.SITE_URL, 'SITE_URL'),
    s3Bucket: required(env.S3_BUCKET, 'S3_BUCKET'),
    leadFunctionName: required(env.LEAD_FUNCTION_NAME, 'LEAD_FUNCTION_NAME'),
    scheduleFunctionName: required(env.SCHEDULE_FUNCTION_NAME, 'SCHEDULE_FUNCTION_NAME'),
    leadRetryTriggerName: required(env.LEAD_RETRY_TRIGGER_NAME, 'LEAD_RETRY_TRIGGER_NAME'),
    ydbDatabaseName: required(env.YDB_DATABASE_NAME, 'YDB_DATABASE_NAME'),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    siteAccessMode: required(env.SITE_ACCESS_MODE, 'SITE_ACCESS_MODE'),
    gatewayName: required(env.GATEWAY_NAME, 'GATEWAY_NAME'),
    authorizerFunctionName: required(env.AUTHORIZER_FUNCTION_NAME, 'AUTHORIZER_FUNCTION_NAME'),
  };
}

function assertExactConfig(actual, expected) {
  for (const key of [
    'siteUrl',
    's3Bucket',
    'leadFunctionName',
    'scheduleFunctionName',
    'leadRetryTriggerName',
    'ydbDatabaseName',
    'siteAccessMode',
    'gatewayName',
    'authorizerFunctionName',
  ]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`deployment-config: ${actual.environment} ${key} must be ${expected[key]}, got ${actual[key]}`);
    }
  }

  if (actual.allowedOrigins.join(',') !== expected.allowedOrigins.join(',')) {
    throw new Error(
      `deployment-config: ${actual.environment} ALLOWED_ORIGINS must be ${expected.allowedOrigins.join(',')}`,
    );
  }
}

function validateConfig(config) {
  if (config.environment === 'production') {
    assertExactConfig(config, PRODUCTION);
  } else if (config.environment === 'staging') {
    assertExactConfig(config, STAGING);
  } else {
    throw new Error(`deployment-config: unsupported environment ${config.environment}`);
  }

  return config;
}

if (require.main === module) {
  try {
    const config = validateConfig(readConfig());
    console.log(`deployment-config: ${config.environment} isolation validated`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { PRODUCTION, STAGING, parseOrigins, readConfig, validateConfig };
