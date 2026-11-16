'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { expectedRoutesFromAstro } = require('../check-routes.cjs');
const { Report, baseSiteUrl, checkLegacyInputs, compareProduction, compareStaging, parseArguments } = require('../compare-dist.cjs');
const { getProfile } = require('../lib/parity-profile.cjs');
const { LEGACY_INPUTS, legacyInputDrift, legacyInputDriftInHistory, readSnapshot, resolveSha } = require('../lib/parity-harness.cjs');

const ROOT = path.resolve(__dirname, '../..');

test('every argument is explicit: SHAs, profile, mode and snapshot', () => {
  const full = ['--base-sha', 'a'.repeat(40), '--candidate-sha', 'HEAD', '--profile', 'a', '--mode', 'production', '--snapshot', 'src/data/map-photos.json'];
  assert.deepEqual(parseArguments(full), {
    baseSha: 'a'.repeat(40),
    candidateSha: 'HEAD',
    clean: false,
    mode: 'production',
    profile: 'a',
    snapshot: 'src/data/map-photos.json',
  });
  assert.throws(() => parseArguments(full.slice(2)), /--base-sha is required/);
  assert.throws(() => parseArguments([...full.slice(0, 6), '--mode', 'preview', ...full.slice(8)]), /--mode must be production or staging/);
  assert.throws(() => parseArguments([...full, '--main']), /unknown argument/);
  assert.throws(() => resolveSha('main', '--base-sha'), /full 40-hex commit SHA/);
  assert.throws(() => resolveSha('f'.repeat(40), '--base-sha'), /not a commit/);
  assert.match(resolveSha('HEAD', '--candidate-sha'), /^[0-9a-f]{40}$/);
});

test('the snapshot is a map of locations to HTTPS photo lists with a stable digest', () => {
  const snapshot = readSnapshot('src/data/map-photos.json');
  assert.match(snapshot.digest, /^[0-9a-f]{64}$/);
  assert.ok(Object.keys(snapshot.data).length >= 1);
  const bad = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-')), 'bad.json');
  fs.writeFileSync(bad, '{"chekhova":["http://insecure"]}');
  assert.throws(() => readSnapshot(bad), /invalid photo list/);
});

function write(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const ANALYTICS_HEAD =
  '<!--  Google Tag Manager  -->\n  <script>(function(w){})(window,"https://www.googletagmanager.com/gtm.js");</script>\n  <!--  End Google Tag Manager  -->\n  <!-- Top.Mail.Ru counter -->\n  <script type="text/javascript">ts.src = "https://top-fwz1.mail.ru/js/code.js";</script>\n  <!-- /Top.Mail.Ru counter -->\n  <!-- Yandex.Metrika counter -->\n  <script type="text/javascript">k.src="https://mc.yandex.ru/metrika/tag.js?id=1"</script>\n  <!-- /Yandex.Metrika counter -->\n';
const SITEMAP =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n  <url>\n    <loc>https://zvenfit.ru/offer/</loc>\n    <lastmod>2026-05-13</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.3</priority>\n  </url>\n</urlset>\n';

function legacyPage() {
  return `<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <title>Оферта</title>\n  <link href="/css/zvenfit.webflow.min.css?v=parity" rel="stylesheet" type="text/css">\n  ${ANALYTICS_HEAD}  <!-- ZvenFit: VK + Yandex Metrika -->\n  <!-- ZvenFit: UTM attribution -->\n  <script src="/js/utm-attribution.js?v=parity" defer></script>\n  <!-- ZvenFit: open-graph -->\n  <!-- ZvenFit: structured-data -->\n</head>\n<body class="body">\n  <p>Текст</p>\n  <a href="/privacy/">p</a>\n  <script src="https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=parity" type="text/javascript"></script>\n<script src="/js/traffic-config.js?v=parity" defer></script>\n  <script src="/js/traffic-beacon.js?v=parity" defer></script>\n  </body>\n</html>\n`;
}

function astroPage({ analytics = true, robots = '' } = {}) {
  return `<!DOCTYPE html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <title>Оферта</title>\n  <link href="/_astro/zvenfit.webflow.Ab12Cd34.css" rel="stylesheet" type="text/css">\n  ${analytics ? ANALYTICS_HEAD : ''}\n  <script src="/_astro/utm-attribution.Ef56Gh78.js" defer></script>${robots}\n</head>\n<body class="body">\n  <p>Текст</p>\n  <a href="/privacy/">p</a>\n  <script src="https://storage.yandexcloud.net/zvenfit/v2/js/webflow.js?v=parity" type="text/javascript" defer></script>\n<script src="/js/traffic-config.js" defer></script>\n  <script src="/_astro/traffic-beacon.Ij90Kl12.js" defer></script>\n  </body>\n</html>`;
}

function productionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-dist-'));
  const baseDir = path.join(root, 'base');
  const candidateDir = path.join(root, 'candidate');
  const baseDist = path.join(baseDir, 'dist');
  const candidateDist = path.join(candidateDir, 'dist');
  write(baseDir, 'public/css/zvenfit.webflow.css', '.a{color:red}\n');
  write(baseDir, 'scripts/structured-data.config.json', '{"siteUrl":"https://zvenfit.ru"}');
  write(candidateDir, 'src/styles/zvenfit.webflow.css', '.a{color:red}\n');
  write(baseDist, 'offer/index.html', legacyPage());
  write(baseDist, 'css/zvenfit.webflow.min.css', '.a{color:red}');
  write(baseDist, 'js/utm-attribution.js', 'utm();');
  write(baseDist, 'js/traffic-beacon.js', 'beacon();');
  write(baseDist, 'js/lead-config.js', "// Injected at build time\nwindow.ZVENFIT_LEAD_API = 'https://parity.invalid/lead';\n");
  write(baseDist, 'js/schedule-config.js', "window.ZVENFIT_SCHEDULE_API = 'https://parity.invalid/schedule';\n");
  write(baseDist, 'js/traffic-config.js', "window.ZVENFIT_TRAFFIC_API = 'https://parity.invalid/traffic';\n");
  write(baseDist, 'js/maps-config.js', 'window.ZVENFIT_MAPS = {\n  "a": 1\n};\n');
  write(baseDist, 'robots.txt', 'User-agent: *\nAllow: /\n');
  write(baseDist, 'sitemap.xml', SITEMAP);
  write(baseDist, 'images/logo.svg', '<svg/>');
  write(candidateDist, 'offer/index.html', astroPage());
  write(candidateDist, '_astro/zvenfit.webflow.Ab12Cd34.css', '.a{color:red}');
  write(candidateDist, '_astro/utm-attribution.Ef56Gh78.js', 'utm();');
  write(candidateDist, '_astro/traffic-beacon.Ij90Kl12.js', 'beacon();');
  write(candidateDist, 'js/lead-config.js', "window.ZVENFIT_LEAD_API = 'https://parity.invalid/lead';\n");
  write(candidateDist, 'js/schedule-config.js', "window.ZVENFIT_SCHEDULE_API = 'https://parity.invalid/schedule';\n");
  write(candidateDist, 'js/traffic-config.js', "window.ZVENFIT_TRAFFIC_API = 'https://parity.invalid/traffic';\n");
  write(candidateDist, 'js/maps-config.js', 'window.ZVENFIT_MAPS = {"a":1};\n');
  write(candidateDist, 'robots.txt', 'User-agent: *\nAllow: /\n');
  write(candidateDist, 'sitemap.xml', SITEMAP);
  write(candidateDist, 'images/logo.svg', '<svg/>');
  return { baseDir, baseDist, candidateDir, candidateDist };
}

const PROFILE = getProfile('a');

function runProduction(fixture) {
  const report = new Report({ profile: 'a', mode: 'production', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
  compareProduction({ ...fixture, pages: ['offer/index.html'], profile: PROFILE, report });
  return report;
}

test('a faithful candidate passes the production comparison with the allow-list applied', () => {
  const report = runProduction(productionFixture());
  assert.deepEqual(report.errors, [], report.render());
  assert.deepEqual(report.routes[0].exceptions, ['offer-webflow-defer×1', 'legacy-marker-analytics×1', 'legacy-marker-utm×1', 'legacy-marker-open-graph×1', 'legacy-marker-structured-data×1']);
  assert.match(report.render(), /Result: PASS/);
  assert.match(report.render(), /utm-attribution\.js \| js\/utm-attribution\.js \| _astro\/utm-attribution\.Ef56Gh78\.js \| bytes equal/);
  assert.match(report.render(), /zvenfit\.webflow\.css \| css\/zvenfit\.webflow\.min\.css \| _astro\/zvenfit\.webflow\.Ab12Cd34\.css \| source and built bytes equal/);
});

test('a stylesheet minified differently from the legacy build fails even when the sources match', () => {
  const fixture = productionFixture();
  write(fixture.candidateDist, '_astro/zvenfit.webflow.Ab12Cd34.css', '.a{color:red}@media (width<=767px){.a{color:#00f}}');
  const built = runProduction(fixture);
  assert.ok(built.errors.some(error => /stylesheet zvenfit\.webflow\.css: built bytes differ from the legacy build/.test(error)), built.render());
  assert.match(built.render(), /zvenfit\.webflow\.css \| css\/zvenfit\.webflow\.min\.css \| _astro\/zvenfit\.webflow\.Ab12Cd34\.css \| MISMATCH/);

  const drifted = productionFixture();
  write(drifted.candidateDir, 'src/styles/zvenfit.webflow.css', '.a{color:blue}\n');
  const source = runProduction(drifted);
  assert.ok(source.errors.some(error => /stylesheet zvenfit\.webflow\.css: source differs between public\/css and src\/styles/.test(error)), source.render());
});

test('the production comparison catches changed scripts, configs, sitemap entries and a page missing on one side', () => {
  const fixture = productionFixture();
  write(fixture.candidateDist, '_astro/traffic-beacon.Ij90Kl12.js', 'beacon(); // changed');
  write(fixture.candidateDist, 'js/lead-config.js', "window.ZVENFIT_LEAD_API = 'https://other.invalid/lead';\n");
  write(fixture.candidateDist, 'sitemap.xml', SITEMAP.replace('0.3', '0.5'));
  const report = runProduction(fixture);
  assert.ok(report.errors.some(error => /script traffic-beacon\.js/.test(error)), report.render());
  assert.ok(report.errors.some(error => /lead-config\.js assignments equal/.test(error)), report.render());
  assert.ok(report.errors.some(error => /sitemap\.xml entries equal/.test(error)), report.render());
  assert.equal(report.errors.length, 3, report.render());
  assert.match(report.render(), /Result: FAIL/);

  const dropped = productionFixture();
  fs.rmSync(path.join(dropped.candidateDist, 'offer/index.html'));
  const missing = runProduction(dropped);
  assert.ok(missing.errors.includes('offer/index.html: missing in candidate dist'), missing.render());
  assert.ok(missing.errors.some(error => /candidate dist contains exactly the profile pages/.test(error)), missing.render());
});

function fullFixture() {
  const fixture = productionFixture();
  // Shipped by the legacy build as a copy of public/; no page references it.
  write(fixture.baseDist, 'js/vendor/imask-7.6.1.LICENSE.txt', 'The MIT License\n');
  write(fixture.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt', 'The MIT License\n');
  return fixture;
}

test('every file of both builds is accounted for', () => {
  const faithful = runProduction(fullFixture());
  assert.deepEqual(faithful.errors, [], faithful.render());
  assert.match(faithful.render(), /ok: js\/vendor\/imask-7\.6\.1\.LICENSE\.txt bytes equal/);
  assert.match(faithful.render(), /ok: images\/logo\.svg bytes equal/);
  assert.match(faithful.render(), /ok: the candidate ships no file without a counterpart in the base build/);

  const dropped = fullFixture();
  fs.rmSync(path.join(dropped.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt'));
  fs.rmSync(path.join(dropped.candidateDist, 'images/logo.svg'));
  const missing = runProduction(dropped);
  assert.ok(missing.errors.includes('js/vendor/imask-7.6.1.LICENSE.txt bytes equal: the base build ships it and the candidate does not'), missing.render());
  assert.ok(missing.errors.includes('images/logo.svg bytes equal: the base build ships it and the candidate does not'), missing.render());

  const changed = fullFixture();
  write(changed.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt', 'Another licence\n');
  assert.ok(runProduction(changed).errors.includes('js/vendor/imask-7.6.1.LICENSE.txt bytes equal: bytes differ'));

  const grown = fullFixture();
  write(grown.candidateDist, '_astro/orphan.Mn34Op56.js', 'orphan();');
  write(grown.candidateDist, 'favicon.ico', 'icon');
  const extra = runProduction(grown);
  assert.ok(extra.errors.includes('the candidate ships no file without a counterpart in the base build: _astro/orphan.Mn34Op56.js, favicon.ico'), extra.render());
});

function commit(repo, message) {
  const git = (...args) => execFileSync('git', ['-c', 'user.name=parity', '-c', 'user.email=parity@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8' }).trim();
  git('add', '-A');
  git('commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

test('the legacy inputs of the candidate tree must be those of the pinned base', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-inputs-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  write(repo, 'public/offer/index.html', '<p>ИНН: 503245058536О</p>');
  write(repo, 'scripts/snippets/analytics-head.html', '<script></script>');
  write(repo, 'scripts/build-static.cjs', '// legacy build');
  write(repo, 'scripts/structured-data.config.json', '{}');
  write(repo, 'scripts/deploy.config.json', '{"profile":"legacy"}');
  const base = commit(repo, 'base');
  // The branch owns everything else: Astro sources and its own deploy profile.
  write(repo, 'src/pages/offer/index.astro', '<p>ИНН: 503245058536О</p>');
  write(repo, 'scripts/deploy.config.json', '{"profile":"a"}');
  const branch = commit(repo, 'astro pages');
  assert.deepEqual(legacyInputDrift(base, branch, { cwd: repo }), []);
  // A hotfix merged from main without pinning the new base.
  write(repo, 'public/offer/index.html', '<p>ИНН: 503245058536</p>');
  write(repo, 'scripts/snippets/analytics-head.html', '<script>changed()</script>');
  const merged = commit(repo, 'hotfix merged');
  assert.deepEqual(legacyInputDrift(base, merged, { cwd: repo }), ['public/offer/index.html', 'scripts/snippets/analytics-head.html']);
  assert.deepEqual(legacyInputDrift(merged, merged, { cwd: repo }), []);
  // Once the legacy build is gone from the branch there is nothing to hold equal.
  fs.rmSync(path.join(repo, 'scripts/build-static.cjs'));
  fs.rmSync(path.join(repo, 'public'), { recursive: true });
  const removed = commit(repo, 'legacy removed');
  assert.equal(legacyInputDrift(base, removed, { cwd: repo }), null);
  assert.ok(LEGACY_INPUTS.includes('public') && LEGACY_INPUTS.includes('scripts/build-static.cjs') && !LEGACY_INPUTS.includes('scripts/deploy.config.json'));
});

// The history of a migration branch in a temporary repository: main keeps the
// legacy site and gets hotfixes, the branch merges main, then drops the legacy
// tree (stage A2b) and merges main again.
function migrationHistory() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-history-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=parity', '-c', 'user.email=parity@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const save = message => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const merge = () => {
    git('merge', '-q', '--no-ff', '--no-edit', 'main');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  git('symbolic-ref', 'HEAD', 'refs/heads/main');
  write(repo, 'public/offer/index.html', '<p>ИНН: 503245058536О</p>');
  write(repo, 'scripts/snippets/analytics-head.html', '<script></script>');
  write(repo, 'scripts/build-static.cjs', '// legacy build');
  write(repo, 'scripts/structured-data.config.json', '{}');
  write(repo, 'scripts/deploy.config.json', '{"profile":"legacy"}');
  write(repo, 'functions/lead-intake/package-lock.json', '{"lockfileVersion":1}');
  const commits = { repo, legacySite: save('legacy site') };

  git('checkout', '-q', '-b', 'astro');
  write(repo, 'src/pages/offer/index.astro', '<p>ИНН: 503245058536О</p>');
  write(repo, 'scripts/deploy.config.json', '{"profile":"a"}');
  commits.astroPages = save('astro pages');

  git('checkout', '-q', 'main');
  write(repo, 'public/offer/index.html', '<p>ИНН: 503245058536</p>');
  commits.firstHotfix = save('hotfix of a page');
  git('checkout', '-q', 'astro');
  commits.firstMerge = merge();

  // A branch that removes the legacy inputs in parts keeps the legacy build for a while.
  git('checkout', '-q', '-b', 'piecemeal');
  fs.rmSync(path.join(repo, 'public'), { recursive: true });
  commits.publicRemovedFirst = save('remove public/ and keep the legacy build');

  git('checkout', '-q', 'astro');
  for (const legacy of ['public', 'scripts/snippets', 'scripts/build-static.cjs', 'scripts/structured-data.config.json']) {
    fs.rmSync(path.join(repo, legacy), { recursive: true });
  }
  commits.legacyRemoved = save('remove the legacy build and the export');

  git('checkout', '-q', 'main');
  write(repo, 'scripts/snippets/analytics-head.html', '<script>changed()</script>');
  commits.secondHotfix = save('hotfix of a snippet');
  git('checkout', '-q', 'astro');
  // The branch deleted the file that main has just changed: git stops with "deleted by us".
  assert.throws(merge);
  assert.equal(git('status', '--porcelain'), 'DU scripts/snippets/analytics-head.html');
  git('rm', '-q', 'scripts/snippets/analytics-head.html');
  git('commit', '-q', '--no-edit');
  commits.secondMerge = git('rev-parse', 'HEAD');

  git('checkout', '-q', 'main');
  write(repo, 'functions/lead-intake/package-lock.json', '{"lockfileVersion":2}');
  commits.functionsOnly = save('a release that leaves the site alone');
  git('checkout', '-q', 'astro');
  commits.thirdMerge = merge();
  return commits;
}

test('main merged after the base was pinned is found in the history, with or without a legacy tree in the candidate', () => {
  const { repo, legacySite, astroPages, firstHotfix, firstMerge, publicRemovedFirst, legacyRemoved, secondHotfix, secondMerge, functionsOnly, thirdMerge } = migrationHistory();
  const history = (base, candidate) => legacyInputDriftInHistory(base, candidate, { cwd: repo });
  const tree = (base, candidate) => legacyInputDrift(base, candidate, { cwd: repo });

  // The branch before any hotfix: what it carries is what the base carries.
  assert.deepEqual(history(legacySite, astroPages), { commits: 1, carrying: 1, drifted: [], files: [] });

  // The first hotfix is merged and the base stays where it was: both checks see it.
  assert.deepEqual(history(legacySite, firstMerge), { commits: 3, carrying: 3, drifted: [firstHotfix, firstMerge], files: ['public/offer/index.html'] });
  assert.deepEqual(tree(legacySite, firstMerge), ['public/offer/index.html']);
  // With the hotfix pinned the history is clean. The older commit of the branch
  // carries the inputs of the previous base, and it is not on the way from the new one.
  assert.deepEqual(history(firstHotfix, firstMerge), { commits: 1, carrying: 1, drifted: [], files: [] });
  assert.deepEqual(tree(firstHotfix, astroPages), ['public/offer/index.html']);

  // The legacy tree leaves the branch: nothing to compare in the candidate, the history still holds.
  assert.equal(tree(firstHotfix, legacyRemoved), null);
  assert.deepEqual(history(firstHotfix, legacyRemoved), { commits: 2, carrying: 1, drifted: [], files: [] });

  // The second hotfix is merged, the conflict is resolved by deleting, nothing
  // is carried over and the base is not pinned again. Only the history tells.
  assert.equal(tree(firstHotfix, secondMerge), null);
  assert.deepEqual(history(firstHotfix, secondMerge), { commits: 4, carrying: 2, drifted: [secondHotfix], files: ['scripts/snippets/analytics-head.html'] });
  assert.deepEqual(history(secondHotfix, secondMerge), { commits: 1, carrying: 0, drifted: [], files: [] });

  // A commit of main that leaves the legacy inputs alone does not ask for a new base.
  assert.deepEqual(history(secondHotfix, thirdMerge), { commits: 3, carrying: 1, drifted: [], files: [] });
  assert.deepEqual(history(firstHotfix, thirdMerge).drifted, [secondHotfix, functionsOnly]);

  // A base the candidate never merged is not a base of its history.
  assert.equal(history(secondHotfix, legacyRemoved), null);
  assert.equal(history(functionsOnly, secondMerge), null);
  assert.throws(() => history('f'.repeat(40), secondMerge));

  // Removing the legacy inputs in parts is a change for as long as the legacy build stays.
  assert.deepEqual(history(firstHotfix, publicRemovedFirst), { commits: 2, carrying: 2, drifted: [publicRemovedFirst], files: ['public/offer/index.html'] });
});

const CLEAN_HISTORY = () => ({ commits: 3, carrying: 2, drifted: [], files: [] });

test('a drift of the legacy inputs fails the report and says what to do', () => {
  const run = (profileName, drift) => {
    const report = new Report({ profile: profileName, mode: 'production', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
    checkLegacyInputs({ baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), profile: getProfile(profileName), report, drift, historyDrift: CLEAN_HISTORY });
    return report;
  };
  assert.deepEqual(run('a', () => []).errors, []);
  assert.match(run('a', () => []).render(), /ok: legacy inputs of the candidate tree equal the pinned base/);
  const drifted = run('a', () => ['public/offer/index.html', 'public/privacy/index.html']);
  assert.equal(drifted.errors.length, 1);
  assert.match(drifted.errors[0], /public\/offer\/index\.html, public\/privacy\/index\.html differ\(s\) from b{40}: after a hotfix of the legacy site merge main into the branch and pin that commit of main as the base/);
  assert.match(run('a', () => Array.from({ length: 11 }, (_, index) => `public/p${index}.html`)).errors[0], /public\/p7\.html and 3 more differ/);
  assert.match(run('a', () => null).render(), /ok: legacy inputs of the candidate tree equal the pinned base \(skipped: the candidate no longer carries scripts\/build-static\.cjs\)/);
  // With an Astro base there is no legacy tree to hold equal.
  assert.deepEqual(run('b', () => ['public/offer/index.html']).checks, []);
});

test('main merged after the base was pinned fails the report of a candidate without a legacy tree', () => {
  const name = 'legacy inputs equal the pinned base in every commit merged since it';
  const advice = 'After a hotfix of the legacy site merge main into the branch, pin that commit of main as the base and carry the fix over to src/ in the same change';
  const run = historyDrift => {
    const report = new Report({ profile: 'a', mode: 'production', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
    checkLegacyInputs({ baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), profile: getProfile('a'), report, drift: () => null, historyDrift });
    return report;
  };
  const clean = run(() => ({ commits: 17, carrying: 12, drifted: [], files: [] }));
  assert.deepEqual(clean.errors, []);
  assert.deepEqual(clean.checks.map(check => check.name), ['legacy inputs of the candidate tree equal the pinned base', name]);
  assert.match(clean.render(), /ok: legacy inputs equal the pinned base in every commit merged since it \(12 of 17 commit\(s\) since the base still carry the legacy build\)/);

  const merged = run(() => ({ commits: 4, carrying: 2, drifted: ['d'.repeat(40)], files: ['scripts/snippets/analytics-head.html'] }));
  assert.deepEqual(merged.errors, [`${name}: scripts/snippets/analytics-head.html differ(s) from ${'b'.repeat(40)} in ${'d'.repeat(40)}: main was merged after the base was pinned. ${advice}`]);
  // The check of the candidate tree has nothing to say here, and says so.
  assert.match(merged.render(), /ok: legacy inputs of the candidate tree equal the pinned base \(skipped: the candidate no longer carries scripts\/build-static\.cjs\)/);

  const several = run(() => ({ commits: 9, carrying: 5, drifted: ['d'.repeat(40), 'e'.repeat(40), 'f'.repeat(40)], files: Array.from({ length: 10 }, (_, index) => `public/p${index}.html`) }));
  assert.equal(several.errors.length, 1);
  assert.match(several.errors[0], /public\/p7\.html and 2 more differ\(s\) from b{40} in d{40} and 2 later commit\(s\): main was merged after the base was pinned\./);

  const unmerged = run(() => null);
  assert.deepEqual(unmerged.errors, [`${name}: ${'b'.repeat(40)} is not an ancestor of the candidate: merge that commit of main into the branch (a shallow clone needs its whole history fetched)`]);
});

test('the staging comparison accepts exactly the documented mode differences', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-dist-staging-'));
  const production = path.join(root, 'production');
  const staging = path.join(root, 'staging');
  for (const [dir, analytics, robots, lead, robotsTxt] of [
    [production, true, '', 'https://parity.invalid/lead', 'User-agent: *\nAllow: /\n'],
    [staging, false, '\n  <meta name="robots" content="noindex, nofollow">', 'https://staging.zvenfit.ru/api/lead', 'User-agent: *\nDisallow: /\n'],
  ]) {
    write(dir, 'offer/index.html', astroPage({ analytics, robots }));
    write(dir, 'js/lead-config.js', `window.ZVENFIT_LEAD_API = '${lead}';\n`);
    write(dir, 'js/schedule-config.js', `window.ZVENFIT_SCHEDULE_API = '${lead.replace('lead', 'schedule')}';\n`);
    write(dir, 'js/traffic-config.js', `window.ZVENFIT_TRAFFIC_API = '${lead.replace('lead', 'traffic')}';\n`);
    write(dir, 'js/maps-config.js', 'window.ZVENFIT_MAPS = {"a":1};\n');
    write(dir, 'robots.txt', robotsTxt);
    write(dir, 'sitemap.xml', SITEMAP);
    write(dir, '_astro/traffic-beacon.Ij90Kl12.js', 'beacon();');
  }
  const report = new Report({ profile: 'a', mode: 'staging', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
  compareStaging({ candidateProduction: production, candidateStaging: staging, pages: ['offer/index.html'], report });
  assert.deepEqual(report.errors, [], report.render());

  write(staging, 'robots.txt', 'User-agent: *\nDisallow: /\n\n');
  write(staging, 'offer/index.html', astroPage({ analytics: false, robots: '\n  <meta name="robots" content="noindex, nofollow">' }).replace('Текст', 'Text'));
  const failing = new Report({ profile: 'a', mode: 'staging', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
  compareStaging({ candidateProduction: production, candidateStaging: staging, pages: ['offer/index.html'], report: failing });
  assert.ok(failing.errors.some(error => /robots\.txt is byte-exact/.test(error)), failing.render());
  assert.ok(failing.errors.some(error => /node mismatch/.test(error)), failing.render());
});

test('the site URL of the base is read where its kind of tree keeps the content configs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'base-site-url-'));
  write(root, 'scripts/structured-data.config.json', '{"siteUrl":"https://legacy.example/"}');
  write(root, 'src/data/structured-data.config.json', '{"siteUrl":"https://astro.example"}');
  assert.equal(baseSiteUrl(root, getProfile('a')), 'https://legacy.example');
  assert.equal(baseSiteUrl(root, getProfile('b')), 'https://astro.example');
});

test('the committed allow-list only names routes of the profiles it applies to', () => {
  const { rules } = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/parity-allowlist.json'), 'utf8'));
  const routes = expectedRoutesFromAstro(path.join(ROOT, 'src/pages'), path.join(ROOT, 'src/content'));
  assert.ok(rules.length >= 1);
  for (const rule of rules) {
    assert.ok(rule.id && rule.reason && rule.count >= 1 && ['comment-removed', 'attribute'].includes(rule.kind), rule.id);
    assert.ok(rule.profiles.length >= 1, `${rule.id} applies to no profile`);
    for (const profileName of rule.profiles) {
      // Throws for a name that is not a profile, such as the retired a1.
      getProfile(profileName);
    }
    for (const route of [...rule.routes.filter(route => route !== '*'), ...(rule.exceptRoutes || [])]) {
      assert.ok(routes.includes(route), `${rule.id}: ${route} is not a route of the site`);
    }
  }
});
