'use strict';

const fs = require('node:fs');

function readInput() {
  return JSON.parse(fs.readFileSync(0, 'utf8'));
}

function isPublicGrantee(grantee = {}) {
  const uri = String(grantee.URI || grantee.uri || '');
  return /\/(AllUsers|AuthenticatedUsers)$/i.test(uri);
}

function verifyAcl(payload) {
  const grants = payload.Grants || payload.grants || [];
  const publicGrant = grants.find(grant => isPublicGrantee(grant.Grantee || grant.grantee));
  if (publicGrant) {
    throw new Error('verify-storage-access: ACL contains a public or all-authenticated-users grant');
  }
}

function containsWildcardPrincipal(principal) {
  if (principal === '*') {
    return true;
  }
  if (Array.isArray(principal)) {
    return principal.some(containsWildcardPrincipal);
  }
  if (principal && typeof principal === 'object') {
    return Object.values(principal).some(containsWildcardPrincipal);
  }
  return false;
}

function verifyPolicy(payload) {
  const rawPolicy = payload.Policy || payload.policy || payload;
  const policy = typeof rawPolicy === 'string' ? JSON.parse(rawPolicy) : rawPolicy;
  const statements = Array.isArray(policy.Statement) ? policy.Statement : policy.Statement ? [policy.Statement] : [];
  const publicAllow = statements.find(statement => {
    const effect = String(statement.Effect || '').toLowerCase();
    const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    const exposesObjects = actions.some(action => /^(\*|s3:\*|s3:(GetObject|ListBucket))$/i.test(String(action)));
    return effect === 'allow' && exposesObjects && containsWildcardPrincipal(statement.Principal);
  });
  if (publicAllow) {
    throw new Error('verify-storage-access: bucket policy allows public object access');
  }
}

function verifyMetadata(bucket) {
  const access = bucket.anonymous_access_flags || {};
  if (access.read || access.list || access.config_read || bucket.website_settings) {
    throw new Error('verify-storage-access: staging bucket must be private and website hosting must be disabled');
  }
}

function main(argv = process.argv.slice(2)) {
  const mode = argv[0];
  const payload = readInput();
  if (mode === 'acl') {
    verifyAcl(payload);
  } else if (mode === 'policy') {
    verifyPolicy(payload);
  } else if (mode === 'metadata') {
    verifyMetadata(payload);
  } else {
    throw new Error('verify-storage-access: expected acl, policy, or metadata mode');
  }
  console.log(`verify-storage-access: ${mode} is private`);
}

if (require.main === module) {
  main();
}

module.exports = { containsWildcardPrincipal, isPublicGrantee, verifyAcl, verifyMetadata, verifyPolicy };
