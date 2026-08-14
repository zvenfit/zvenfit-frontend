'use strict';

const fs = require('node:fs');
const path = require('node:path');

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`generate-staging-gateway-spec: ${name} is required`);
  }
  return normalized;
}

function collectHtmlRoutes(distDir) {
  const routes = [];

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        const objectName = path.relative(distDir, absolutePath).split(path.sep).join('/');
        if (objectName === '404.html') {
          continue;
        }

        let route = `/${objectName}`;
        if (objectName === 'index.html') {
          route = '/';
        } else if (objectName.endsWith('/index.html')) {
          route = `/${objectName.slice(0, -'index.html'.length)}`;
        }

        routes.push({ route, objectName });
      }
    }
  }

  walk(distDir);
  return routes.sort((left, right) => left.route.localeCompare(right.route));
}

function storageOperation(bucket, objectName) {
  return {
    responses: {
      200: { description: 'Static staging content' },
      401: { description: 'Authentication required' },
      403: { description: 'Access denied' },
      404: { description: 'Not found' },
    },
    'x-yc-apigateway-integration': {
      type: 'object_storage',
      bucket,
      object: objectName,
      error_object: { object: '404.html', statusCode: 404 },
    },
  };
}

function functionOperation(functionId, method) {
  return {
    responses: {
      200: { description: 'Successful response' },
      401: { description: 'Authentication required' },
      403: { description: 'Access denied' },
    },
    'x-yc-apigateway-integration': {
      type: 'cloud_functions',
      function_id: functionId,
      tag: 'staging-live',
      payload_format_version: '0.1',
      context: { environment: 'staging', method },
    },
  };
}

function buildSpecification({
  distDir,
  bucket,
  gatewayServiceAccountId,
  authorizerFunctionId,
  leadFunctionId,
  scheduleFunctionId,
  securityProfileId,
}) {
  const paths = {};
  for (const { route, objectName } of collectHtmlRoutes(distDir)) {
    paths[route] = { get: storageOperation(bucket, objectName) };
    if (route !== '/' && route.endsWith('/')) {
      paths[route.slice(0, -1)] = { get: storageOperation(bucket, objectName) };
    }
  }

  paths['/api/lead'] = { post: functionOperation(leadFunctionId, 'lead') };
  paths['/api/schedule'] = { get: functionOperation(scheduleFunctionId, 'schedule') };
  paths['/{asset+}'] = {
    parameters: [
      {
        name: 'asset',
        in: 'path',
        required: true,
        schema: { type: 'string' },
      },
    ],
    get: storageOperation(bucket, '{asset}'),
  };

  return {
    openapi: '3.0.0',
    info: {
      title: 'ZvenFit private staging',
      version: '1.0.0',
    },
    'x-yc-apigateway': {
      service_account_id: gatewayServiceAccountId,
      smartWebSecurity: {
        securityProfileId,
      },
    },
    security: [{ stagingBasicAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        stagingBasicAuth: {
          type: 'http',
          scheme: 'basic',
          'x-yc-apigateway-authorizer': {
            type: 'function',
            function_id: authorizerFunctionId,
            tag: 'staging-live',
            service_account_id: gatewayServiceAccountId,
            authorizer_result_ttl_in_seconds: 60,
            authorizer_result_caching_mode: 'path',
          },
        },
      },
    },
  };
}

function readArgument(argv, name, fallback) {
  const index = argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return required(argv[index + 1], name);
}

function main() {
  const argv = process.argv.slice(2);
  const distDir = path.resolve(readArgument(argv, '--dist', path.resolve(__dirname, '../dist')));
  const output = path.resolve(required(readArgument(argv, '--output'), '--output'));

  const specification = buildSpecification({
    distDir,
    bucket: required(process.env.STAGING_BUCKET, 'STAGING_BUCKET'),
    gatewayServiceAccountId: required(process.env.YC_GATEWAY_SERVICE_ACCOUNT_ID, 'YC_GATEWAY_SERVICE_ACCOUNT_ID'),
    authorizerFunctionId: required(process.env.STAGING_AUTHORIZER_FUNCTION_ID, 'STAGING_AUTHORIZER_FUNCTION_ID'),
    leadFunctionId: required(process.env.STAGING_LEAD_FUNCTION_ID, 'STAGING_LEAD_FUNCTION_ID'),
    scheduleFunctionId: required(process.env.STAGING_SCHEDULE_FUNCTION_ID, 'STAGING_SCHEDULE_FUNCTION_ID'),
    securityProfileId: required(
      process.env.STAGING_SWS_SECURITY_PROFILE_ID,
      'STAGING_SWS_SECURITY_PROFILE_ID',
    ),
  });

  fs.writeFileSync(output, `${JSON.stringify(specification, null, 2)}\n`, 'utf8');
  console.log(`generate-staging-gateway-spec: ${Object.keys(specification.paths).length} authenticated routes written`);
}

if (require.main === module) {
  main();
}

module.exports = { buildSpecification, collectHtmlRoutes };
