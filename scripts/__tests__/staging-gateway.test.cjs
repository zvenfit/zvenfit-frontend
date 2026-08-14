'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const VERIFY_INVOKER = path.join(ROOT, 'scripts/verify-function-invoker.cjs');
const { buildSpecification, collectHtmlRoutes } = require('../generate-staging-gateway-spec.cjs');
const { credentialHash } = require('../hash-staging-basic-auth.cjs');
const { assertPrivateUrl } = require('../assert-private-http.cjs');
const { verify: verifyNoPublicIam } = require('../verify-no-public-iam.cjs');
const { verifyAcl, verifyMetadata, verifyPolicy } = require('../verify-storage-access.cjs');
const { verify: verifyAuthorizerResult } = require('../verify-authorizer-result.cjs');

function withDist(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zvenfit-gateway-test-'));
  try {
    fs.mkdirSync(path.join(directory, 'raspisanie'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'nested/page'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), 'home');
    fs.writeFileSync(path.join(directory, '404.html'), 'not found');
    fs.writeFileSync(path.join(directory, 'raspisanie/index.html'), 'schedule');
    fs.writeFileSync(path.join(directory, 'nested/page/index.html'), 'nested');
    return run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('collects exact trailing-slash routes for every generated HTML page', () => {
  withDist(directory => {
    assert.deepEqual(collectHtmlRoutes(directory), [
      { route: '/', objectName: 'index.html' },
      { route: '/nested/page/', objectName: 'nested/page/index.html' },
      { route: '/raspisanie/', objectName: 'raspisanie/index.html' },
    ]);
  });
});

test('gateway protects static files and same-origin APIs with one Basic authorizer', () => {
  withDist(directory => {
    const specification = buildSpecification({
      distDir: directory,
      bucket: 'zvenfit-frontend-staging',
      gatewayServiceAccountId: 'gateway-service-account',
      authorizerFunctionId: 'authorizer-function',
      leadFunctionId: 'lead-function',
      scheduleFunctionId: 'schedule-function',
      trafficFunctionId: 'traffic-function',
      securityProfileId: 'sws-profile',
    });

    assert.deepEqual(specification.security, [{ stagingBasicAuth: [] }]);
    assert.equal(specification['x-yc-apigateway'].service_account_id, 'gateway-service-account');
    assert.deepEqual(specification['x-yc-apigateway'].smartWebSecurity, {
      securityProfileId: 'sws-profile',
    });
    assert.equal(
      specification.components.securitySchemes.stagingBasicAuth['x-yc-apigateway-authorizer'].function_id,
      'authorizer-function',
    );
    assert.equal(
      specification.paths['/raspisanie/'].get['x-yc-apigateway-integration'].object,
      'raspisanie/index.html',
    );
    assert.equal(specification.paths['/raspisanie'].get['x-yc-apigateway-integration'].object, 'raspisanie/index.html');
    assert.equal(specification.paths['/{asset+}'].get['x-yc-apigateway-integration'].object, '{asset}');
    assert.equal(specification.paths['/api/lead'].post['x-yc-apigateway-integration'].function_id, 'lead-function');
    assert.equal(
      specification.paths['/api/schedule'].get['x-yc-apigateway-integration'].function_id,
      'schedule-function',
    );
    assert.equal(
      specification.paths['/api/traffic'].post['x-yc-apigateway-integration'].function_id,
      'traffic-function',
    );
    assert.deepEqual(specification.components.securitySchemes.stagingBasicAuth['x-yc-apigateway-authorizer'], {
      type: 'function',
      function_id: 'authorizer-function',
      tag: 'staging-live',
      service_account_id: 'gateway-service-account',
      authorizer_result_ttl_in_seconds: 60,
      authorizer_result_caching_mode: 'path',
    });
    assert.equal(
      specification.paths['/api/lead'].post['x-yc-apigateway-integration'].tag,
      'staging-live',
    );
  });
});

function verify(mode, bindings, serviceAccountId = '') {
  return spawnSync(process.execPath, [VERIFY_INVOKER, mode, serviceAccountId], {
    input: JSON.stringify(bindings),
    encoding: 'utf8',
  });
}

test('gateway function policy accepts only the explicitly allowed service accounts', () => {
  const privateBindings = [
    {
      role_id: 'functions.functionInvoker',
      subject: { type: 'serviceAccount', id: 'gateway-sa' },
    },
  ];
  assert.equal(verify('gateway', privateBindings, 'gateway-sa').status, 0);
  assert.equal(verify('gateway', privateBindings, 'wrong-sa').status, 1);

  const leadBindings = [
    ...privateBindings,
    {
      role_id: 'functions.functionInvoker',
      subject: { type: 'serviceAccount', id: 'lead-runtime-sa' },
    },
  ];
  assert.equal(verify('gateway', leadBindings, 'gateway-sa,lead-runtime-sa').status, 0);
  assert.equal(verify('gateway', leadBindings, 'gateway-sa').status, 1);

  const publicBindings = [
    {
      role_id: 'functions.functionInvoker',
      subject: { type: 'system', id: 'allUsers' },
    },
  ];
  assert.equal(verify('gateway', publicBindings, 'gateway-sa').status, 1);
  assert.equal(verify('public', publicBindings).status, 0);

  const extraInvoker = [
    ...leadBindings,
    {
      role_id: 'functions.functionInvoker',
      subject: { type: 'serviceAccount', id: 'unrelated-sa' },
    },
  ];
  assert.equal(verify('gateway', extraInvoker, 'gateway-sa,lead-runtime-sa').status, 1);
});

test('Basic credential hash accepts only an unambiguous high-entropy ASCII pair', () => {
  const environment = {
    STAGING_BASIC_AUTH_USERNAME: 'zvenfit.qa',
    STAGING_BASIC_AUTH_PASSWORD: '9JsTnF6q_K3w7mP2vX8cR4aD5eH1uB0z',
  };
  assert.match(credentialHash(environment), /^[a-f0-9]{64}$/);
  assert.throws(() => credentialHash({ ...environment, STAGING_BASIC_AUTH_USERNAME: 'bad:name' }), /without colon/);
  assert.throws(() => credentialHash({ ...environment, STAGING_BASIC_AUTH_PASSWORD: 'short' }), /at least 32/);
  assert.throws(
    () =>
      credentialHash({ ...environment, STAGING_BASIC_AUTH_PASSWORD: `${environment.STAGING_BASIC_AUTH_PASSWORD} ` }),
    /without spaces/,
  );
});

test('storage verification rejects public flags, ACL groups, and wildcard policies', () => {
  assert.doesNotThrow(() =>
    verifyMetadata({ anonymous_access_flags: { read: false, list: false, config_read: false } }),
  );
  assert.throws(() => verifyMetadata({ anonymous_access_flags: { read: true } }), /must be private/);

  assert.doesNotThrow(() => verifyAcl({ Grants: [{ Grantee: { Type: 'CanonicalUser', ID: 'deploy-sa' } }] }));
  assert.throws(
    () =>
      verifyAcl({
        Grants: [
          { Grantee: { URI: 'http://acs.amazonaws.com/groups/global/AllUsers' }, Permission: 'READ' },
        ],
      }),
    /public/,
  );
  assert.throws(
    () =>
      verifyPolicy({
        Policy: JSON.stringify({
          Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject' }],
        }),
      }),
    /public object access/,
  );
});

test('parent IAM audit rejects public invoker and storage roles', () => {
  assert.doesNotThrow(() =>
    verifyNoPublicIam([
      { role_id: 'viewer', subject: { type: 'system', id: 'allUsers' } },
      { role_id: 'storage.editor', subject: { type: 'serviceAccount', id: 'deploy-sa' } },
    ]),
  );
  assert.throws(
    () =>
      verifyNoPublicIam([
        { role_id: 'functions.functionInvoker', subject: { type: 'system', id: 'allAuthenticatedUsers' } },
      ]),
    /public parent IAM binding/,
  );
});

test('effective anonymous probe accepts only access-denied statuses', async () => {
  await assert.doesNotReject(() =>
    assertPrivateUrl('https://private.example/index.html', {
      fetchImpl: async () => ({ status: 403 }),
    }),
  );
  await assert.rejects(
    () =>
      assertPrivateUrl('https://public.example/index.html', {
        fetchImpl: async () => ({ status: 200 }),
      }),
    /private boundary is not proven/,
  );
});

test('authorizer candidate verification checks both allow and deny results', () => {
  assert.doesNotThrow(() =>
    verifyAuthorizerResult('{"isAuthorized":true,"context":{"environment":"staging"}}', true),
  );
  assert.doesNotThrow(() => verifyAuthorizerResult('{"isAuthorized":false}', false));
  assert.throws(() => verifyAuthorizerResult('{"isAuthorized":true}', true), /staging context/);
});
