'use strict';

// Builds the protected staging variant the way the deploy does (the deploy
// job passes NODE_ENV and the API addresses; this script supplies them itself
// because the quality job runs it without an environment) and then runs the
// same guards as the deploy: routes, build contract, staging contract. The
// parity profile is forwarded to the guards (`--profile a1` inside branch A1).

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const profileIndex = process.argv.indexOf('--profile');
const profileArguments = profileIndex === -1 ? [] : ['--profile', process.argv[profileIndex + 1]];
const environment = {
  ...process.env,
  NODE_ENV: 'staging',
  LEAD_API_URL: 'https://staging.zvenfit.ru/api/lead',
  SCHEDULE_API_URL: 'https://staging.zvenfit.ru/api/schedule',
  TRAFFIC_API_URL: 'https://staging.zvenfit.ru/api/traffic',
  ASSET_VERSION: process.env.ASSET_VERSION || 'staging-test',
};

const steps = [
  ['npm', ['run', 'build']],
  [process.execPath, [path.join(root, 'scripts', 'check-routes.cjs'), '--source', 'astro', ...profileArguments]],
  [process.execPath, [path.join(root, 'scripts', 'check-build.cjs'), ...profileArguments]],
  [process.execPath, [path.join(root, 'scripts', 'check-staging-build.cjs')]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { cwd: root, env: environment, stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
