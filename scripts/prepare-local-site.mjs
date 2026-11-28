// Rebuild the committed source before stamping an existing local dist.
// The upload uses this private copy only after every byte matches the operator's build.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { loadEnv } from 'vite';
import publicConfig from './lib/deployed-site-config.cjs';
import planner from './cleanup-bucket-assets.cjs';

const temp = process.argv[2];
const root = process.cwd();
const bucket = process.env.YC_S3_BUCKET || 'zvenfit-frontend';
const mode =
  bucket === 'zvenfit-frontend-staging'
    ? 'staging'
    : bucket === 'zvenfit-frontend'
      ? 'production'
      : process.env.NODE_ENV || 'production';
const revision = process.env.LOCAL_DEPLOY_REVISION || 'HEAD';
const sha = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', revision + '^{commit}'], {
  encoding: 'utf8',
}).trim();
if (['zvenfit-frontend', 'zvenfit-frontend-staging'].includes(bucket)) {
  // The manual cleanup workflow can rebuild only revisions in the history of main.
  execFileSync('git', ['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main']);
}
const index = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const version = index.match(
  /<script\b[^>]*\bsrc="https:\/\/storage\.yandexcloud\.net\/zvenfit\/v2\/js\/webflow\.js\?v=([^"]+)"/,
)?.[1];
planner.deployment({ 'deployed-sha': sha, 'asset-version': version });

const site = path.join(temp, 'site');
const archive = path.join(temp, 'source.tar');
mkdirSync(site);
execFileSync('git', ['archive', '--format=tar', '--output', archive, sha]);
execFileSync('tar', ['-xf', archive, '-C', site]);
const names = ['LEAD_API_URL', 'SCHEDULE_API_URL', 'TRAFFIC_API_URL', 'Y_MAPS_API_KEY'];
const settings = loadEnv(mode, root, names);
const home = path.join(temp, 'home');
mkdirSync(home);
const env = { PATH: process.env.PATH, HOME: home, npm_config_cache: path.join(homedir(), '.npm') };
function run(command, args) {
  execFileSync(command, args, { cwd: site, env, stdio: ['ignore', 2, 2] });
}
run('npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund']);
for (const name of names) if (settings[name] !== undefined) env[name] = settings[name];
Object.assign(env, { NODE_ENV: mode, ASSET_VERSION: version });
run('npm', ['run', 'build']);
run('node', ['scripts/check-routes.cjs']);
run('node', ['scripts/check-build.cjs']);
if (mode === 'staging') run('node', ['scripts/check-staging-build.cjs']);
run('diff', ['-qr', path.join(root, 'dist'), path.join(site, 'dist')]);
const digest = publicConfig.configDigest(key => readFileSync(path.join(site, 'dist', key)));
console.log(`deployed-sha=${sha},asset-version=${version},runtime-config-sha256=${digest}`);
