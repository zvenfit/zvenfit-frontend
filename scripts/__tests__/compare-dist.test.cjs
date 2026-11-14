'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { Report, baseSiteUrl, checkLegacyInputs, compareProduction, compareStaging, parseArguments } = require('../compare-dist.cjs');
const { getProfile } = require('../lib/parity-profile.cjs');
const { LEGACY_INPUTS, legacyInputDrift, readSnapshot, resolveSha } = require('../lib/parity-harness.cjs');

const ROOT = path.resolve(__dirname, '../..');

test('every argument is explicit: SHAs, profile, mode and snapshot', () => {
  const full = ['--base-sha', 'a'.repeat(40), '--candidate-sha', 'HEAD', '--profile', 'a1', '--mode', 'production', '--snapshot', 'src/data/map-photos.json'];
  assert.deepEqual(parseArguments(full), {
    baseSha: 'a'.repeat(40),
    candidateSha: 'HEAD',
    clean: false,
    mode: 'production',
    profile: 'a1',
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
  write(baseDir, 'public/offer/index.html', '<html></html>');
  write(baseDir, 'public/privacy/index.html', '<html></html>');
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

const PROFILE = { ...getProfile('a1'), pages: ['offer/index.html'] };

function runProduction(fixture) {
  const report = new Report({ profile: 'a1', mode: 'production', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
  compareProduction({ ...fixture, pages: PROFILE.pages, inventory: ['offer/index.html', 'privacy/index.html'], profile: PROFILE, report });
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

test('the production comparison catches changed scripts, configs, sitemap entries and links to unknown routes', () => {
  const fixture = productionFixture();
  write(fixture.candidateDist, '_astro/traffic-beacon.Ij90Kl12.js', 'beacon(); // changed');
  write(fixture.candidateDist, 'js/lead-config.js', "window.ZVENFIT_LEAD_API = 'https://other.invalid/lead';\n");
  write(fixture.candidateDist, 'sitemap.xml', SITEMAP.replace('0.3', '0.5'));
  write(fixture.candidateDist, 'offer/index.html', astroPage().replace('<a href="/privacy/">p</a>', '<a href="/privacy/">p</a><a href="/ghost/">g</a>'));
  write(fixture.baseDist, 'offer/index.html', legacyPage().replace('<a href="/privacy/">p</a>', '<a href="/privacy/">p</a><a href="/ghost/">g</a>'));
  const report = runProduction(fixture);
  assert.ok(report.errors.some(error => /script traffic-beacon\.js/.test(error)), report.render());
  assert.ok(report.errors.some(error => /lead-config\.js assignments equal/.test(error)), report.render());
  assert.ok(report.errors.some(error => /sitemap\.xml entries equal/.test(error)), report.render());
  assert.ok(report.errors.some(error => /links to \/ghost\//.test(error)), report.render());
  assert.match(report.render(), /Result: FAIL/);
});

const FULL_PROFILE = getProfile('a');

function runFull(fixture) {
  const report = new Report({ profile: 'a', mode: 'production', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
  compareProduction({ ...fixture, pages: ['offer/index.html'], inventory: ['offer/index.html'], profile: FULL_PROFILE, report });
  return report;
}

function fullFixture() {
  const fixture = productionFixture();
  // Shipped by the legacy build as a copy of public/; no page references it.
  write(fixture.baseDist, 'js/vendor/imask-7.6.1.LICENSE.txt', 'The MIT License\n');
  write(fixture.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt', 'The MIT License\n');
  return fixture;
}

test('with a full profile every file of both builds is accounted for', () => {
  const faithful = runFull(fullFixture());
  assert.deepEqual(faithful.errors, [], faithful.render());
  assert.match(faithful.render(), /ok: js\/vendor\/imask-7\.6\.1\.LICENSE\.txt bytes equal/);
  assert.match(faithful.render(), /ok: images\/logo\.svg bytes equal/);
  assert.match(faithful.render(), /ok: the candidate ships no file without a counterpart in the base build/);

  const dropped = fullFixture();
  fs.rmSync(path.join(dropped.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt'));
  fs.rmSync(path.join(dropped.candidateDist, 'images/logo.svg'));
  const missing = runFull(dropped);
  assert.ok(missing.errors.includes('js/vendor/imask-7.6.1.LICENSE.txt bytes equal: the base build ships it and the candidate does not'), missing.render());
  assert.ok(missing.errors.includes('images/logo.svg bytes equal: the base build ships it and the candidate does not'), missing.render());

  const changed = fullFixture();
  write(changed.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt', 'Another licence\n');
  assert.ok(runFull(changed).errors.includes('js/vendor/imask-7.6.1.LICENSE.txt bytes equal: bytes differ'));

  const grown = fullFixture();
  write(grown.candidateDist, '_astro/orphan.Mn34Op56.js', 'orphan();');
  write(grown.candidateDist, 'favicon.ico', 'icon');
  const extra = runFull(grown);
  assert.ok(extra.errors.includes('the candidate ships no file without a counterpart in the base build: _astro/orphan.Mn34Op56.js, favicon.ico'), extra.render());
});

test('a partial profile compares the images of the candidate and leaves the file sets alone', () => {
  const fixture = fullFixture();
  fs.rmSync(path.join(fixture.candidateDist, 'js/vendor/imask-7.6.1.LICENSE.txt'));
  const report = runProduction(fixture);
  assert.deepEqual(report.errors, [], report.render());
  assert.match(report.render(), /ok: images\/logo\.svg bytes equal/);
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

test('a drift of the legacy inputs fails the report and says what to do', () => {
  const run = (profileName, drift) => {
    const report = new Report({ profile: profileName, mode: 'production', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
    checkLegacyInputs({ baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), profile: getProfile(profileName), report, drift });
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
  const report = new Report({ profile: 'a1', mode: 'staging', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
  compareStaging({ candidateProduction: production, candidateStaging: staging, pages: ['offer/index.html'], report });
  assert.deepEqual(report.errors, [], report.render());

  write(staging, 'robots.txt', 'User-agent: *\nDisallow: /\n\n');
  write(staging, 'offer/index.html', astroPage({ analytics: false, robots: '\n  <meta name="robots" content="noindex, nofollow">' }).replace('Текст', 'Text'));
  const failing = new Report({ profile: 'a1', mode: 'staging', baseSha: 'b'.repeat(40), candidateSha: 'c'.repeat(40), baseKind: 'legacy', snapshotPath: 's', snapshotDigest: 'd', fixture: 'f' });
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
  for (const rule of rules) {
    assert.ok(rule.id && rule.reason && rule.count >= 1 && ['comment-removed', 'attribute'].includes(rule.kind), rule.id);
    for (const profileName of rule.profiles) {
      const profile = getProfile(profileName);
      for (const route of rule.routes.filter(route => route !== '*')) {
        if (profile.partial) {
          assert.ok(profile.pages.includes(route), `${rule.id}: ${route} is not a page of ${profileName}`);
        }
      }
    }
  }
});
