'use strict';

const fs = require('node:fs');

const SENSITIVE_ROLES = [
  /^admin$/,
  /^editor$/,
  /^storage\.(viewer|editor|admin)$/,
  /^(functions|serverless\.functions)\.functionInvoker$/,
];

function isPublicSubject(subject = {}) {
  const type = String(subject.type || '').toLowerCase();
  const id = String(subject.id || '').toLowerCase();
  return type === 'system' && ['allusers', 'allauthenticatedusers'].includes(id);
}

function verify(bindings) {
  const exposed = bindings.filter(binding => {
    const role = String(binding.role_id || binding.roleId || '');
    return isPublicSubject(binding.subject) && SENSITIVE_ROLES.some(pattern => pattern.test(role));
  });
  if (exposed.length) {
    throw new Error(`verify-no-public-iam: public parent IAM binding detected for ${exposed[0].role_id}`);
  }
}

if (require.main === module) {
  verify(JSON.parse(fs.readFileSync(0, 'utf8')));
  console.log('verify-no-public-iam: no public sensitive parent binding found');
}

module.exports = { isPublicSubject, verify };
