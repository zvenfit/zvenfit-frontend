'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const environment = {
  ...process.env,
  NODE_ENV: 'staging',
  LEAD_API_URL: 'https://staging.zvenfit.ru/api/lead',
  SCHEDULE_API_URL: 'https://staging.zvenfit.ru/api/schedule',
  ASSET_VERSION: process.env.ASSET_VERSION || 'staging-test',
};

for (const script of ['build-static.cjs', 'check-build.cjs', 'check-staging-build.cjs']) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
