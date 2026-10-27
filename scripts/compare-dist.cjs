'use strict';

// Parity check between a pinned base commit and a candidate commit
// (docs/astro-migration.md, section 8).
//
//   node scripts/compare-dist.cjs --base-sha <40-hex> --candidate-sha <40-hex|HEAD> \
//     --profile a1|a|b --mode production|staging --snapshot src/data/map-photos.json \
//     [--work-dir <dir>] [--report <file>] [--clean]
//
// --mode production builds the base (legacy build-static.cjs for profiles a1
// and a, Astro for b) and the candidate in disposable worktrees with fixed
// non-secret variables and the committed map-photo snapshot, then compares the
// profile pages node by node, the own assets, the runtime configs, robots.txt
// and sitemap.xml. --mode staging builds the candidate twice (production and
// staging) and allows only the documented differences between the modes.
// Neither main nor the dirty working tree is ever used as a side: both SHAs are
// explicit (HEAD is accepted for local runs and resolved to its commit).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const parity = require('./lib/html-parity.cjs');
const harness = require('./lib/parity-harness.cjs');
const { getProfile, pageToRoute } = require('./lib/parity-profile.cjs');

const ALLOWLIST_PATH = path.join(__dirname, 'parity-allowlist.json');
const STAGING_ROBOTS = 'User-agent: *\nDisallow: /\n';
const ASSET_PREFIXES = ['/js/', '/css/', '/_astro/', '/images/'];

function parseArguments(argv) {
  const options = { clean: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    switch (argument) {
      case '--base-sha':
      case '--candidate-sha':
      case '--profile':
      case '--mode':
      case '--snapshot':
      case '--work-dir':
      case '--report':
        if (value === undefined) {
          throw new Error(`compare-dist: ${argument} requires a value`);
        }
        options[argument.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
        index += 1;
        break;
      case '--clean':
        options.clean = true;
        break;
      default:
        throw new Error(`compare-dist: unknown argument ${argument}`);
    }
  }
  for (const required of ['baseSha', 'candidateSha', 'profile', 'mode', 'snapshot']) {
    if (!options[required]) {
      throw new Error(`compare-dist: --${required.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)} is required`);
    }
  }
  if (!['production', 'staging'].includes(options.mode)) {
    throw new Error('compare-dist: --mode must be production or staging');
  }
  return options;
}

function walkFiles(dir, predicate, files = [], base = dir) {
  if (!fs.existsSync(dir)) {
    return files;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, files, base);
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(path.relative(base, fullPath).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function listHtml(dir) {
  return walkFiles(dir, name => name.endsWith('.html'));
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

function loadAllowlist() {
  return JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')).rules;
}

function evaluateMapsConfig(source) {
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return sandbox.window.ZVENFIT_MAPS;
}

class Report {
  constructor(options) {
    this.meta = options;
    this.routes = [];
    this.assets = [];
    this.checks = [];
    this.errors = [];
  }

  check(name, ok, detail = '') {
    this.checks.push({ name, ok, detail });
    if (!ok) {
      this.errors.push(detail ? `${name}: ${detail}` : name);
    }
  }

  render() {
    const lines = [
      '# compare-dist report',
      '',
      `- profile: ${this.meta.profile}, mode: ${this.meta.mode}`,
      `- base: ${this.meta.baseSha} (${this.meta.baseKind})`,
      `- candidate: ${this.meta.candidateSha}`,
      `- snapshot: ${this.meta.snapshotPath} sha256 ${this.meta.snapshotDigest}`,
      `- fixture override: ${this.meta.fixture}`,
      `- build variables: ASSET_VERSION=${harness.ASSET_VERSION}; production API URLs ${Object.values(harness.FIXED_ENV.production).join(', ')}; staging API URLs ${Object.values(harness.FIXED_ENV.staging).join(', ')}; Y_MAPS_API_KEY empty`,
      '',
      '## Routes',
      '',
      '| route | nodes compared | exceptions applied |',
      '| --- | --- | --- |',
      ...this.routes.map(route => `| ${route.route} | ${route.nodes} | ${route.exceptions.length ? route.exceptions.join('; ') : 'none'} |`),
      '',
    ];
    if (this.assets.length) {
      lines.push('## Assets', '', '| asset | base | candidate | check |', '| --- | --- | --- | --- |');
      lines.push(...this.assets.map(asset => `| ${asset.name} | ${asset.base} | ${asset.candidate} | ${asset.check} |`), '');
    }
    lines.push('## Checks', '', ...this.checks.map(check => `- ${check.ok ? 'ok' : 'FAIL'}: ${check.name}${check.detail ? ` (${check.detail})` : ''}`), '');
    lines.push(`## Result: ${this.errors.length === 0 ? 'PASS' : `FAIL (${this.errors.length} problem(s))`}`);
    if (this.errors.length) {
      lines.push('', ...this.errors.map(error => `- ${error}`));
    }
    return `${lines.join('\n')}\n`;
  }
}

function inventoryFromGit(baseSha, profile) {
  const { execFileSync } = require('node:child_process');
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baseSha], { cwd: harness.ROOT, encoding: 'utf8' }).split('\n');
  if (profile.base === 'legacy') {
    return files.filter(file => file.startsWith('public/') && file.endsWith('.html')).map(file => file.slice('public/'.length)).sort();
  }
  const { astroPageToRoute } = require('./check-routes.cjs');
  return files
    .filter(file => file.startsWith('src/pages/') && file.endsWith('.astro'))
    .map(file => file.slice('src/pages/'.length))
    .filter(file => !file.split('/').some(segment => segment.startsWith('_')) && !/\[[^\]]+\]/.test(file))
    .map(astroPageToRoute)
    .concat(
      files
        .filter(file => file.startsWith('src/content/trainers/') && file.endsWith('.json'))
        .map(file => `trenery/${path.posix.basename(file, '.json')}/index.html`),
    )
    .sort();
}

function compareProduction({ baseDir, baseDist, candidateDir, candidateDist, pages, inventory, profile, report }) {
  const allRules = loadAllowlist();
  const assets = parity.createAssetRegistry();
  const inventoryRoutes = new Set(inventory.map(pageToRoute));

  for (const route of pages) {
    if (!inventory.includes(route)) {
      report.errors.push(`${route}: profile page is not in the base inventory`);
      continue;
    }
    const baseHtml = readIfExists(path.join(baseDist, route));
    const candidateHtml = readIfExists(path.join(candidateDist, route));
    if (!baseHtml || !candidateHtml) {
      report.errors.push(`${route}: missing in ${!baseHtml ? 'base' : 'candidate'} dist`);
      continue;
    }
    const rules = parity.rulesForRoute(allRules, { profile: profile.name, mode: 'production', route });
    const result = parity.compareHtml({ route, baseHtml: baseHtml.toString('utf8'), candidateHtml: candidateHtml.toString('utf8'), rules, assets });
    report.routes.push({ route, nodes: result.nodes, exceptions: [...result.ruleMatches].map(([id, count]) => `${id}×${count}`) });
    report.errors.push(...result.errors);

    if (profile.partial) {
      for (const link of parity.internalLinks(candidateHtml.toString('utf8'))) {
        if (!inventoryRoutes.has(link) && !ASSET_PREFIXES.some(prefix => link.startsWith(prefix))) {
          report.errors.push(`${route}: links to ${link}, which is neither a base route nor an asset`);
        }
      }
    }
  }

  for (const rule of allRules.filter(rule => rule.profiles.includes(profile.name) && rule.mode === 'production')) {
    for (const route of rule.routes.filter(route => route !== '*')) {
      if (!pages.includes(route)) {
        report.errors.push(`allow-list rule ${rule.id} names ${route}, which is not a page of profile ${profile.name}`);
      }
    }
  }

  const candidateRoutes = listHtml(candidateDist);
  report.check('candidate dist contains exactly the profile pages', JSON.stringify(candidateRoutes) === JSON.stringify([...pages].sort()), `${candidateRoutes.join(', ')}`);

  for (const [name, baseFile] of assets.base.scripts) {
    const candidateFile = assets.candidate.scripts.get(name);
    const baseBytes = readIfExists(path.join(baseDist, baseFile));
    const candidateBytes = candidateFile ? readIfExists(path.join(candidateDist, candidateFile)) : null;
    const equal = Boolean(baseBytes && candidateBytes && baseBytes.equals(candidateBytes));
    report.assets.push({ name, base: baseFile, candidate: candidateFile || 'missing', check: equal ? 'bytes equal' : 'MISMATCH' });
    if (!equal) {
      report.errors.push(`script ${name}: ${!candidateFile ? 'the candidate never references it' : 'bytes differ or a file is missing'}`);
    }
  }
  for (const name of assets.candidate.scripts.keys()) {
    if (!assets.base.scripts.has(name)) {
      report.errors.push(`script ${name}: referenced by the candidate but never by the base`);
    }
  }
  for (const [name, baseFile] of assets.base.styles) {
    const candidateFile = assets.candidate.styles.get(name);
    const baseSource = readIfExists(path.join(baseDir, 'public', 'css', name));
    const candidateSource = readIfExists(path.join(candidateDir, 'src', 'styles', name));
    const candidateBuilt = candidateFile ? readIfExists(path.join(candidateDist, candidateFile)) : null;
    const ok = Boolean(baseSource && candidateSource && baseSource.equals(candidateSource) && candidateBuilt && candidateBuilt.length > 0 && fs.existsSync(path.join(baseDist, baseFile)));
    report.assets.push({ name, base: baseFile, candidate: candidateFile || 'missing', check: ok ? 'source bytes equal, built file present' : 'MISMATCH' });
    if (!ok) {
      report.errors.push(`stylesheet ${name}: source differs between public/css and src/styles, or a built file is missing`);
    }
  }

  for (const config of parity.CONFIGS.filter(name => name !== 'maps-config.js')) {
    const base = readIfExists(path.join(baseDist, 'js', config));
    const candidate = readIfExists(path.join(candidateDist, 'js', config));
    let detail = '';
    let ok = Boolean(base && candidate);
    if (ok) {
      try {
        const left = parity.parseConfigAssignments(base.toString('utf8'));
        const right = parity.parseConfigAssignments(candidate.toString('utf8'));
        ok = JSON.stringify([...left]) === JSON.stringify([...right]);
        detail = [...right].map(([key, value]) => `${key}=${value}`).join(', ');
      } catch (error) {
        ok = false;
        detail = error.message;
      }
    }
    report.check(`js/${config} assignments equal`, ok, detail);
  }
  const baseMaps = readIfExists(path.join(baseDist, 'js', 'maps-config.js'));
  const candidateMaps = readIfExists(path.join(candidateDist, 'js', 'maps-config.js'));
  let mapsOk = Boolean(baseMaps && candidateMaps);
  if (mapsOk) {
    try {
      mapsOk = JSON.stringify(evaluateMapsConfig(baseMaps.toString('utf8'))) === JSON.stringify(evaluateMapsConfig(candidateMaps.toString('utf8')));
    } catch (error) {
      mapsOk = false;
    }
  }
  report.check('js/maps-config.js runtime objects equal', mapsOk);

  const baseRobots = readIfExists(path.join(baseDist, 'robots.txt'));
  const candidateRobots = readIfExists(path.join(candidateDist, 'robots.txt'));
  report.check('robots.txt bytes equal', Boolean(baseRobots && candidateRobots && baseRobots.equals(candidateRobots)));

  const baseSitemap = parity.readSitemap((readIfExists(path.join(baseDist, 'sitemap.xml')) || '').toString('utf8'));
  const candidateSitemap = parity.readSitemap((readIfExists(path.join(candidateDist, 'sitemap.xml')) || '').toString('utf8'));
  const siteUrl = JSON.parse(fs.readFileSync(path.join(baseDir, 'scripts', 'structured-data.config.json'), 'utf8')).siteUrl.replace(/\/$/, '');
  const expectedUrls = pages.filter(route => route !== '404.html').map(route => `${siteUrl}${pageToRoute(route)}`).sort();
  const sitemapErrors = [];
  for (const url of expectedUrls) {
    if (!baseSitemap.has(url)) {
      sitemapErrors.push(`${url} missing in base sitemap`);
    } else if (JSON.stringify(baseSitemap.get(url)) !== JSON.stringify(candidateSitemap.get(url))) {
      sitemapErrors.push(`${url}: ${JSON.stringify(baseSitemap.get(url))} -> ${JSON.stringify(candidateSitemap.get(url) || null)}`);
    }
  }
  if (JSON.stringify([...candidateSitemap.keys()].sort()) !== JSON.stringify(expectedUrls)) {
    sitemapErrors.push(`candidate sitemap lists ${[...candidateSitemap.keys()].sort().join(', ')}`);
  }
  report.check(`sitemap.xml entries equal for ${expectedUrls.length} URL(s)`, sitemapErrors.length === 0, sitemapErrors.join('; '));

  for (const image of walkFiles(path.join(candidateDist, 'images'), () => true)) {
    const left = readIfExists(path.join(baseDist, 'images', image));
    const right = readIfExists(path.join(candidateDist, 'images', image));
    report.check(`images/${image} bytes equal`, Boolean(left && right && left.equals(right)));
  }
}

function compareStaging({ candidateProduction, candidateStaging, pages, report }) {
  const assets = parity.createAssetRegistry();
  for (const route of pages) {
    const production = readIfExists(path.join(candidateProduction, route));
    const staging = readIfExists(path.join(candidateStaging, route));
    if (!production || !staging) {
      report.errors.push(`${route}: missing in the ${!production ? 'production' : 'staging'} candidate build`);
      continue;
    }
    const result = parity.compareModes({ route, productionHtml: production.toString('utf8'), stagingHtml: staging.toString('utf8'), assets });
    report.routes.push({
      route,
      nodes: result.nodes,
      exceptions: [`analytics nodes removed×${result.counts.analyticsRemoved}`, `robots meta replaced×${result.counts.robotsRemoved}→${result.counts.robotsInserted}`],
    });
    report.errors.push(...result.errors);
  }
  const productionRoutes = listHtml(candidateProduction);
  const stagingRoutes = listHtml(candidateStaging);
  report.check('both builds contain the same routes', JSON.stringify(productionRoutes) === JSON.stringify(stagingRoutes));
  report.check('both builds contain exactly the profile pages', JSON.stringify(productionRoutes) === JSON.stringify([...pages].sort()), productionRoutes.join(', '));

  const stagingRobots = readIfExists(path.join(candidateStaging, 'robots.txt'));
  report.check('staging robots.txt is byte-exact', Boolean(stagingRobots && stagingRobots.toString('utf8') === STAGING_ROBOTS));

  for (const config of parity.CONFIGS.filter(name => name !== 'maps-config.js')) {
    const variable = `${config.split('-')[0].toUpperCase()}_API_URL`;
    let ok = false;
    let detail = '';
    try {
      const production = parity.parseConfigAssignments((readIfExists(path.join(candidateProduction, 'js', config)) || '').toString('utf8'));
      const staging = parity.parseConfigAssignments((readIfExists(path.join(candidateStaging, 'js', config)) || '').toString('utf8'));
      const key = [...production.keys()][0];
      ok =
        production.size === 1 &&
        staging.size === 1 &&
        staging.has(key) &&
        production.get(key) === harness.FIXED_ENV.production[variable] &&
        staging.get(key) === harness.FIXED_ENV.staging[variable];
      detail = `${key}: ${production.get(key)} -> ${staging.get(key)}`;
    } catch (error) {
      detail = error.message;
    }
    report.check(`js/${config} differs only in its value`, ok, detail);
  }
  const productionMaps = readIfExists(path.join(candidateProduction, 'js', 'maps-config.js'));
  const stagingMaps = readIfExists(path.join(candidateStaging, 'js', 'maps-config.js'));
  report.check('js/maps-config.js bytes equal across modes', Boolean(productionMaps && stagingMaps && productionMaps.equals(stagingMaps)));

  const productionSitemap = readIfExists(path.join(candidateProduction, 'sitemap.xml'));
  const stagingSitemap = readIfExists(path.join(candidateStaging, 'sitemap.xml'));
  report.check('sitemap.xml bytes equal across modes', Boolean(productionSitemap && stagingSitemap && productionSitemap.equals(stagingSitemap)));

  const productionAssets = walkFiles(path.join(candidateProduction, '_astro'), () => true);
  const stagingAssets = walkFiles(path.join(candidateStaging, '_astro'), () => true);
  const sameAssets =
    JSON.stringify(productionAssets) === JSON.stringify(stagingAssets) &&
    productionAssets.every(file => fs.readFileSync(path.join(candidateProduction, '_astro', file)).equals(fs.readFileSync(path.join(candidateStaging, '_astro', file))));
  report.check(`_astro/ assets identical across modes (${productionAssets.length} file(s))`, sameAssets, sameAssets ? '' : `${productionAssets.join(', ')} vs ${stagingAssets.join(', ')}`);
}

function run(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const log = message => console.log(`compare-dist: ${message}`);
  const profile = getProfile(options.profile);
  const baseSha = harness.resolveSha(options.baseSha, '--base-sha');
  const candidateSha = harness.resolveSha(options.candidateSha, '--candidate-sha');
  if (baseSha === candidateSha) {
    throw new Error('compare-dist: base and candidate must be different commits');
  }
  const snapshot = harness.readSnapshot(options.snapshot);
  const workDir = options.workDir ? path.resolve(options.workDir) : harness.defaultWorkDir();
  const candidateDir = path.join(workDir, `candidate-${candidateSha}`);
  const baseDir = path.join(workDir, `base-${baseSha}`);
  const report = new Report({
    profile: profile.name,
    mode: options.mode,
    baseSha,
    baseKind: profile.base === 'legacy' ? 'legacy build-static.cjs' : 'astro build',
    candidateSha,
    snapshotPath: path.relative(harness.ROOT, snapshot.path),
    snapshotDigest: snapshot.digest,
    fixture:
      profile.base === 'legacy'
        ? 'scripts/maps.config.json.locationPhotos replaced by the snapshot in the base worktree during its build; curl stub (exit 22) first in PATH'
        : 'none (both sides read src/data/map-photos.json)',
  });

  try {
    harness.prepareWorktree(candidateSha, candidateDir, log);
    harness.install(candidateDir, log);
    harness.assertCandidateSnapshot(candidateDir, snapshot);
    const candidateProduction = harness.buildAstro({ dir: candidateDir, mode: 'production', log });

    if (options.mode === 'production') {
      harness.prepareWorktree(baseSha, baseDir, log);
      harness.install(baseDir, log);
      const baseDist = profile.base === 'legacy' ? harness.buildLegacy({ dir: baseDir, snapshot, log }) : harness.buildAstro({ dir: baseDir, mode: 'production', log });
      const inventory = profile.base === 'legacy' ? listHtml(path.join(baseDir, 'public')) : listHtml(baseDist);
      const pages = profile.partial ? [...profile.pages] : inventory;
      compareProduction({ baseDir, baseDist, candidateDir, candidateDist: candidateProduction, pages, inventory, profile, report });
    } else {
      const candidateStaging = harness.buildAstro({ dir: candidateDir, mode: 'staging', log });
      const inventory = inventoryFromGit(baseSha, profile);
      const pages = profile.partial ? [...profile.pages] : inventory;
      compareStaging({ candidateProduction, candidateStaging, pages, report });
    }
  } finally {
    if (options.clean) {
      harness.removeWorktree(candidateDir);
      harness.removeWorktree(baseDir);
    }
  }

  const rendered = report.render();
  if (options.report) {
    fs.mkdirSync(path.dirname(path.resolve(options.report)), { recursive: true });
    fs.writeFileSync(path.resolve(options.report), rendered, 'utf8');
  }
  process.stdout.write(rendered);
  return report;
}

module.exports = { Report, compareProduction, compareStaging, inventoryFromGit, parseArguments };

if (require.main === module) {
  try {
    const report = run();
    process.exitCode = report.errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
