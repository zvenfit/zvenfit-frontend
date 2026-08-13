'use strict';

const fs = require('node:fs');

const mode = process.argv[2];
const serviceAccountId = process.argv[3] || '';
const bindings = JSON.parse(fs.readFileSync(0, 'utf8'));

if (!Array.isArray(bindings)) {
  throw new Error('verify-function-invoker: bindings must be an array');
}

const invokers = bindings.filter(binding => binding.role_id === 'functions.functionInvoker');
const hasPublicInvoker = invokers.some(
  binding => binding.subject?.type === 'system' && binding.subject?.id === 'allUsers',
);

if (mode === 'public') {
  if (!hasPublicInvoker) {
    throw new Error('verify-function-invoker: public functionInvoker binding is missing');
  }
  process.exit(0);
}

if (mode === 'gateway') {
  if (!serviceAccountId) {
    throw new Error('verify-function-invoker: gateway service account id is required');
  }
  if (hasPublicInvoker) {
    throw new Error('verify-function-invoker: staging function must not allow allUsers');
  }

  const gatewayCanInvoke = invokers.some(
    binding => binding.subject?.type === 'serviceAccount' && binding.subject?.id === serviceAccountId,
  );
  if (!gatewayCanInvoke) {
    throw new Error('verify-function-invoker: gateway service account binding is missing');
  }
  const unexpectedInvoker = invokers.some(
    binding => binding.subject?.type !== 'serviceAccount' || binding.subject?.id !== serviceAccountId,
  );
  if (unexpectedInvoker) {
    throw new Error('verify-function-invoker: unexpected functionInvoker binding is present');
  }
  process.exit(0);
}

throw new Error(`verify-function-invoker: unsupported mode ${mode || '<empty>'}`);
