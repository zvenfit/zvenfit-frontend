'use strict';

// Use the deployed checkout's fresh dist/. The control script comes from main.
// See knowledge-base/staging-runbook.md for the rollback window and recovery.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parse } = require('parse5');
const importMaps = require('@import-maps/resolve');
const css = require('css-tree');
const ts = require('typescript');
const { parse: parseImports } = require('es-module-lexer');
const { PRODUCTION, STAGING } = require('./validate-deployment-config.cjs');

const DAY = 86_400_000;
// Leave space within GitHub's 1 MiB step limit for the execute progress line.
const PLAN_SUMMARY_BYTES = 1024 * 1024 - 1024;
const MIN_AGE_DAYS = 2; // Derivation in knowledge-base/cdn-runbook.md.
const SITES = new Map([
  ['staging', STAGING],
  ['production', PRODUCTION],
]);
const WORKFLOW_REF = 'zvenfit/zvenfit-frontend/.github/workflows/cleanup-assets.yml@refs/heads/main';

function options(env) {
  const environment = env.CLEANUP_ENVIRONMENT;
  const bucket = SITES.get(environment)?.s3Bucket;
  if (!bucket) throw new Error('Select staging or production');
  const execute = env.CLEANUP_EXECUTE ?? 'false';
  if (!['true', 'false'].includes(execute)) throw new Error('execute must be true or false');
  const prefix = env.CLEANUP_PREFIXES ?? '_astro/';
  if (prefix !== '_astro/') throw new Error('Only the _astro/ prefix is enabled before release B');
  const days = env.CLEANUP_MIN_AGE_DAYS ?? String(MIN_AGE_DAYS);
  if (!/^\d+$/.test(days) || !Number.isSafeInteger(Number(days) * DAY) || Number(days) < MIN_AGE_DAYS) {
    throw new Error(`min_age_days must be a whole number of at least ${MIN_AGE_DAYS}`);
  }
  return { environment, bucket, prefix, execute: execute === 'true', days: Number(days) };
}

function deployment(metadata) {
  const sha = metadata?.['deployed-sha'];
  const version = metadata?.['asset-version'];
  if (!/^[0-9a-f]{40}$/.test(sha ?? '') || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(version ?? '')) {
    throw new Error('Missing or invalid release metadata on live HTML. Check the last site deployment.');
  }
  return { sha, version };
}

function bucketClient(bucket, tempDir) {
  function aws(operation, ...args) {
    return execFileSync(
      'aws',
      [
        's3api',
        operation,
        '--bucket',
        bucket,
        '--endpoint-url',
        'https://storage.yandexcloud.net',
        '--region',
        'ru-central1',
        '--output',
        'json',
        '--no-cli-pager',
        ...args,
      ],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  }
  function readObject(key) {
    // The temporary file name never comes from an object key.
    const file = path.join(tempDir, 'object');
    const result = JSON.parse(aws('get-object', '--key', key, file));
    return { metadata: result.Metadata, body: fs.readFileSync(file) };
  }
  return {
    deployment() {
      return deployment(JSON.parse(aws('head-object', '--key', 'index.html')).Metadata);
    },
    list() {
      // aws paginates list-objects-v2 by default and combines Contents across pages.
      const result = JSON.parse(aws('list-objects-v2'));
      if (result.IsTruncated || result.NextContinuationToken || result.NextToken) {
        throw new Error('Incomplete bucket listing');
      }
      return result.Contents ?? [];
    },
    readHtml(key) {
      const { metadata, body } = readObject(key);
      return { release: deployment(metadata), html: body };
    },
    readAsset(key) {
      return readObject(key).body;
    },
  };
}

function siteKey(value, base, site) {
  if (!URL.canParse(value, base)) return;
  const url = new URL(value, base);
  if (!['https:', 'http:'].includes(url.protocol)) return;
  let key;
  if (
    site.allowedOrigins.includes(url.origin) ||
    url.origin === `https://${site.s3Bucket}.storage.yandexcloud.net` ||
    url.origin === `https://${site.s3Bucket}.website.yandexcloud.net`
  ) {
    key = url.pathname.slice(1);
  } else if (url.origin === 'https://storage.yandexcloud.net' && url.pathname.startsWith(`/${site.s3Bucket}/`)) {
    key = url.pathname.slice(site.s3Bucket.length + 2);
  }
  if (key !== undefined) {
    return decodeURIComponent(key.replace(/%(?![0-9a-f]{2})/gi, '%25'));
  }
}

function assetKey(value, base, site) {
  const key = siteKey(value, base, site);
  if (key?.startsWith('_astro/')) return key;
}

function addAssetUrl(refs, value, base, site) {
  const key = assetKey(value, base, site);
  if (key) refs.add(key);
}

function addCssReferences(refs, value, context, base, site, visitCode) {
  const ast = css.parse(value, { context, parseCustomProperty: true });
  css.walk(ast, function (node) {
    const isImport = this.atrule?.name.toLowerCase() === 'import' && this.atrulePrelude?.children.first === node;
    // CSS also accepts quoted URL strings directly in @import and image-set().
    if (
      node.type === 'Url' ||
      (node.type === 'String' &&
        (isImport || ['image-set', '-webkit-image-set', 'image', 'src'].includes(this.function?.name.toLowerCase())))
    ) {
      addAssetUrl(refs, node.value, base, site);
      if (isImport) visitCode(new URL(node.value, base), 'css');
    }
  });
}

function addModuleReferences(source, base, importMap, visitCode) {
  const [imports] = parseImports(source);
  for (const { type, specifier, glob } of imports) {
    if (type === 'import-meta') continue;
    if (!specifier || glob) throw new Error(`Cannot verify a computed module import in ${base.pathname}`);
    const { resolvedImport } = importMaps.resolve(specifier, importMap, base);
    if (resolvedImport) visitCode(resolvedImport, 'js');
  }
}

// A classic script can load a site asset through Image, fetch, a worker, etc.
function addScriptLiterals(refs, source, bases, scriptUrl, site, deployedKeys, inspectCall) {
  const assetBases = [...bases].filter(base => assetKey('.', base, site));
  const tree = ts.createSourceFile('asset.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if (inspectCall && (ts.isCallExpression(node) || ts.isNewExpression(node))) inspectCall(node);
    const dynamic = ts.isTemplateExpression(node);
    if (dynamic || ts.isStringLiteralLike(node)) {
      const value = dynamic ? node.head.text : node.text;
      const parent = node.parent;
      // Module specifiers resolve against the module URL and are handled by addModuleReferences.
      if (
        parent.moduleSpecifier === node ||
        (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)
      )
        return;
      const urlArgs =
        ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 'URL'
          ? parent.arguments
          : undefined;
      if (urlArgs?.[1] === node) return; // A base URL need not itself identify a file.
      let knownBase;
      const baseArg = urlArgs?.[1];
      if (baseArg && urlArgs[0] === node) {
        if (ts.isStringLiteralLike(baseArg) && URL.canParse(baseArg.text)) knownBase = baseArg.text;
        if (
          ts.isPropertyAccessExpression(baseArg) &&
          baseArg.name.text === 'url' &&
          ts.isMetaProperty(baseArg.expression)
        )
          knownBase = scriptUrl;
      }
      const pathHint = value.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      // Ordinary relative URLs use the document base. Check all possible pages of a shared script.
      const explicit = knownBase || pathHint.includes('_astro/');
      // Workers resolve fetch()/importScripts() against their own URL. A shared script can
      // run in either context; retain any actual bucket key that its literal could address.
      const fixedPath = !dynamic || /[?#]/.test(value);
      if (fixedPath && !knownBase) {
        const workerKey = assetKey(value, scriptUrl, site);
        if (deployedKeys.has(workerKey)) refs.add(workerKey);
      }
      const targets = knownBase ? [knownBase] : explicit ? bases : assetBases;
      for (const base of targets) {
        const key = assetKey(value, base, site);
        if (!key) continue;
        if (!fixedPath) throw new Error('Cannot verify a computed asset URL: ' + value);
        // Under an asset base ordinary strings can be event names or actual object keys.
        if (explicit || deployedKeys.has(key)) refs.add(key);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

// Return the fixed portion of a request before its first runtime substitution.
function addressPrefix(node) {
  if (ts.isStringLiteralLike(node)) return { text: node.text, fixed: true };
  if (ts.isTemplateExpression(node)) return { text: node.head.text, fixed: false };
  if (ts.isParenthesizedExpression(node)) return addressPrefix(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = addressPrefix(node.left);
    if (!left.fixed) return left;
    const right = addressPrefix(node.right);
    return { text: left.text + right.text, fixed: right.fixed };
  }
  return { text: '', fixed: false };
}

function workerAddress(node, base, scriptUrl, site) {
  if (ts.isNewExpression(node) && node.expression.text === 'URL' && node.arguments?.length === 2) {
    const [address, relativeTo] = node.arguments;
    if (relativeTo.getText() === 'import.meta.url') return workerAddress(address, scriptUrl, scriptUrl, site);
    if (ts.isStringLiteralLike(relativeTo)) return workerAddress(address, new URL(relativeTo.text), scriptUrl, site);
  }
  const { text, fixed } = addressPrefix(node);
  if (fixed || /[?#]/.test(text)) return new URL(text, base);
  // Only a complete external origin is independent of the runtime filename.
  // Locally imported worker code can use an asset regardless of its own directory.
  if (/^(?:https?:)?\/\/[^/]+\//i.test(text) && siteKey(text, base, site) === undefined) {
    const url = new URL(text, base);
    // A path-style storage host can also address the selected bucket.
    if (url.origin !== 'https://storage.yandexcloud.net') return;
  }
  throw new Error('Cannot verify a computed asset URL in ' + scriptUrl.href);
}

// Each document has its own import map. Follow its modules and CSS imports with
// their actual URLs, including when the same script runs under different maps.
function codeGraph(refs, site, readCode, importedFiles, documentBase, deployedKeys) {
  const seen = new Set();
  let importMap = {};
  const entries = [];
  function inspectWorkerCalls(source, scriptUrl, workerBase) {
    const base = workerBase || documentBase;
    addScriptLiterals(refs, source, [base], scriptUrl, site, deployedKeys, node => {
      const api = node.expression.name?.text ?? node.expression.text;
      const startsWorker =
        (ts.isNewExpression(node) && ['Worker', 'SharedWorker'].includes(api)) ||
        (api === 'register' && node.expression.expression?.name?.text === 'serviceWorker');
      if (!node.arguments?.length) return;
      if (startsWorker) {
        const entry = workerAddress(node.arguments[0], base, scriptUrl, site);
        if (entry) visitCode(entry, 'js', entry);
      } else if (workerBase && ['fetch', 'Request', 'importScripts'].includes(api)) {
        const args = api === 'importScripts' ? node.arguments : [node.arguments[0]];
        for (const argument of args) {
          const address = workerAddress(argument, workerBase, scriptUrl, site);
          if (!address) continue;
          if (api === 'importScripts') visitCode(address, 'js', workerBase);
          else addAssetUrl(refs, address, workerBase, site);
        }
      }
    });
  }
  function visitCode(url, kind, workerBase) {
    const key = siteKey(url, url, site);
    if (key === undefined) return;
    if (key.startsWith('_astro/')) refs.add(key);
    const identity = JSON.stringify([kind, url.href, workerBase?.href]);
    if (seen.has(identity)) return;
    seen.add(identity);
    const source = readCode(key);
    if (kind === 'css' || /\.css$/i.test(key)) {
      addCssReferences(refs, source, 'stylesheet', url, site, visitCode);
    } else {
      importedFiles.add(key);
      addModuleReferences(source, url, workerBase ? {} : importMap, (target, type) =>
        visitCode(target, type, workerBase),
      );
      inspectWorkerCalls(source, url, workerBase);
    }
  }
  function runEntries() {
    for (const entry of entries) {
      if (entry.url) visitCode(entry.url, entry.kind);
      else {
        addModuleReferences(entry.source, documentBase, importMap, visitCode);
        inspectWorkerCalls(entry.source, documentBase);
      }
    }
  }
  return {
    visitCode,
    entries,
    runEntries,
    addMap(source) {
      // Earlier code may run before registration, or import later after it.
      runEntries();
      seen.clear();
      const next = importMaps.parseFromString(source, documentBase);
      const merge = (earlier, later) =>
        Object.fromEntries(Object.entries({ ...later, ...earlier }).sort(([a], [b]) => (a < b ? 1 : -1)));
      const scopes = merge(importMap.scopes, next.scopes);
      for (const key of Object.keys(scopes)) scopes[key] = merge(importMap.scopes?.[key], next.scopes?.[key]);
      importMap = { imports: merge(importMap.imports, next.imports), scopes };
    },
  };
}

function addReferences(refs, html, route, site, deployedKeys, readCode, importedFiles) {
  const document = parse(html, { scriptingEnabled: false });
  const pageUrl = new URL(route, site.siteUrl);
  const head = document.childNodes
    .find(node => node.tagName === 'html')
    ?.childNodes.find(node => node.tagName === 'head');
  const baseTag = head?.childNodes.find(
    node => node.tagName === 'base' && node.attrs.some(attr => attr.name === 'href'),
  );
  const href = baseTag?.attrs.find(attr => attr.name === 'href')?.value;
  const base = href && URL.canParse(href, pageUrl) ? new URL(href, pageUrl) : pageUrl;
  const graph = codeGraph(refs, site, readCode, importedFiles, base, deployedKeys);
  // URL attributes can contain spaces, parentheses, commas and HTML entities.
  function addUrl(value) {
    addAssetUrl(refs, value, base, site);
  }
  function scan(value) {
    for (const match of value.matchAll(/\/_astro\//g)) {
      // Preserve an absolute origin or a path prefix in metadata, JSON and inline code.
      const prefix = value.slice(0, match.index).match(/[^\s"'`<>()=]*$/)[0];
      const start = match.index - prefix.length;
      const tail = value.slice(start);
      const quote = value[start - 1];
      if (['"', "'", '`'].includes(quote)) {
        addUrl(tail.split(quote, 1)[0]);
      } else if (/url\(\s*$/i.test(value.slice(0, match.index))) {
        addUrl(tail.split(')', 1)[0]);
      } else {
        addUrl(tail.split(/[\s"'<>`]/, 1)[0]);
      }
    }
  }
  function visit(node) {
    const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (node.tagName === 'script' && attrs.src) graph.entries.push({ url: new URL(attrs.src, base), kind: 'js' });
    if (node.tagName === 'link' && attrs.href) {
      const preload = rel.includes('preload') && attrs.as?.toLowerCase();
      const style = rel.includes('stylesheet') || preload === 'style';
      if (style || rel.includes('modulepreload') || preload === 'script') {
        graph.entries.push({ url: new URL(attrs.href, base), kind: style ? 'css' : 'js' });
      }
    }
    for (const { name, value } of node.attrs ?? []) {
      if (node.tagName === 'base' && name === 'href') continue;
      if (name === 'style') {
        addCssReferences(refs, value, 'declarationList', base, site, graph.visitCode);
      } else if (['href', 'src', 'poster', 'data', 'action'].includes(name)) {
        addUrl(value);
      } else if (name === 'srcset' || name === 'imagesrcset') {
        // A candidate starts at the beginning or after a separator. Commas
        // inside its URL are legal; trailing commas delimit descriptorless URLs.
        for (const match of value.matchAll(/(?:^|(?<=,))\s*([^,\s]\S*)/g)) addUrl(match[1].replace(/,+$/, ''));
      } else {
        scan(value);
      }
    }
    if (node.nodeName === '#text') {
      if (node.parentNode?.tagName === 'style')
        addCssReferences(refs, node.value, 'stylesheet', base, site, graph.visitCode);
      else if (node.parentNode?.tagName === 'script') {
        const type =
          node.parentNode.attrs
            .find(attr => attr.name === 'type')
            ?.value.trim()
            .toLowerCase() || '';
        if (!type || type === 'module' || /(?:java|ecma)script/.test(type)) {
          // Dynamic import() is also valid in classic scripts.
          graph.entries.push({ source: node.value });
        } else if (type === 'importmap') graph.addMap(node.value);
        else scan(node.value);
      } else scan(node.value);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(document);
  graph.runEntries();
  return base.href;
}

function sameSet(expected, actual, label) {
  const missing = [...expected].filter(key => !actual.has(key));
  const extra = [...actual].filter(key => !expected.has(key));
  if (missing.length || extra.length) {
    throw new Error(
      `Live HTML differs from dist (${label}). Missing in bucket: ${JSON.stringify(missing)}. Extra in bucket: ${JSON.stringify(extra)}`,
    );
  }
}

function modified(object) {
  const timestamp = Date.parse(object.LastModified);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid LastModified for ${object.Key}`);
  return timestamp;
}

function selectCandidates(objects, files, prefix, cutoff) {
  return objects
    .filter(object => {
      const { Key: key, Size: size } = object;
      if (!key.startsWith(prefix) || files.has(key)) return false;
      // Skip directory markers and ambiguous path segments even inside the prefix.
      if (key.split('/').some(part => !part || part === '.' || part === '..')) return false;
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid Size for ${key}`);
      return modified(object) < cutoff;
    })
    .sort((a, b) => a.Key.localeCompare(b.Key, 'en'));
}

// Encode object keys for a Markdown table, including unusual S3 key characters.
function displayKey(key) {
  return '<code>' + key.replace(/[&<>|\x00-\x1f]/g, char => `&#${char.charCodeAt(0)};`) + '</code>';
}

function planCleanup({ config, client, dist, sha, now = Date.now(), report }) {
  const release = client.deployment();
  if (sha !== release.sha) throw new Error('The checkout SHA differs from the deployed SHA');
  const files = new Set(
    fs
      .readdirSync(dist, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => path.relative(dist, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')),
  );
  const pages = new Set([...files].filter(key => key.endsWith('.html')));
  if (!pages.has('index.html')) throw new Error('Incomplete dist: missing index.html');

  const objects = client.list();
  const deployedKeys = new Set(objects.map(object => object.Key));
  const htmlObjects = objects.filter(object => object.Key.endsWith('.html'));
  sameSet(pages, new Set(htmlObjects.map(object => object.Key)), 'pages');
  const builtRefs = new Set();
  const documentBases = new Set();
  const site = SITES.get(config.environment);
  const verifiedCode = new Map();
  const importedFiles = new Set();
  function readCode(key) {
    if (!files.has(key)) throw new Error(`Incomplete dist: missing referenced asset ${key}`);
    if (!deployedKeys.has(key)) throw new Error(`Incomplete deployment: missing bucket object ${key}`);
    if (!verifiedCode.has(key)) {
      const built = fs.readFileSync(path.join(dist, key));
      if (!built.equals(client.readAsset(key))) throw new Error(`Live code differs from dist: ${key}`);
      verifiedCode.set(key, built.toString('utf8'));
    }
    return verifiedCode.get(key);
  }
  let lastHtml = 0;
  for (const object of htmlObjects) {
    const page = client.readHtml(object.Key);
    if (page.release.sha !== sha || page.release.version !== release.version) {
      throw new Error(`Mixed deployment on ${object.Key}. Check the last site deployment.`);
    }
    lastHtml = Math.max(lastHtml, modified(object));
    // Byte equality proves even references embedded in inline code match the build.
    const builtHtml = fs.readFileSync(path.join(dist, object.Key));
    if (!builtHtml.equals(page.html)) throw new Error(`Live HTML differs from dist: ${object.Key}`);
    documentBases.add(
      addReferences(builtRefs, builtHtml.toString('utf8'), object.Key, site, deployedKeys, readCode, importedFiles),
    );
  }
  if (!builtRefs.size) throw new Error('No /_astro/ references in dist');
  const fallback = codeGraph(builtRefs, site, readCode, importedFiles, new URL(site.siteUrl), deployedKeys);
  for (const key of files) {
    if (key.startsWith(config.prefix) && !deployedKeys.has(key))
      throw new Error(`Incomplete deployment: missing bucket object ${key}`);
    const fileUrl = new URL(key, site.siteUrl);
    if (/\.m?js$/i.test(key)) {
      const source = fs.readFileSync(path.join(dist, key), 'utf8');
      if (!importedFiles.has(key)) addModuleReferences(source, fileUrl, {}, fallback.visitCode);
      addScriptLiterals(builtRefs, source, documentBases, fileUrl, site, deployedKeys);
    } else if (/\.css$/i.test(key)) {
      addCssReferences(
        builtRefs,
        fs.readFileSync(path.join(dist, key), 'utf8'),
        'stylesheet',
        fileUrl,
        site,
        fallback.visitCode,
      );
    }
  }
  for (const key of builtRefs) {
    if (!files.has(key)) throw new Error(`Incomplete dist: missing referenced asset ${key}`);
  }

  const cutoff = now - config.days * DAY;
  const candidates = selectCandidates(objects, files, config.prefix, cutoff);
  const bytes = candidates.reduce((sum, object) => sum + object.Size, 0);
  const windowEnds = lastHtml + MIN_AGE_DAYS * DAY;
  const overview = [
    '### Bucket asset cleanup',
    '',
    `Mode: **${config.execute ? 'execute' : 'dry-run'}** · ${config.environment} · \`${config.bucket}\``,
    `Deployed SHA: \`${sha}\` · asset version ${release.version}`,
    `Verified HTML pages: ${pages.size}. Distinct /_astro/ references: ${builtRefs.size}.`,
    `Candidates: **${candidates.length}** · Total bytes: **${bytes}**. Under \`${config.prefix}\`, absent from dist, LastModified strictly before ${new Date(cutoff).toISOString()} (${config.days} days).`,
    `Rollback window from latest HTML upload ends at ${new Date(windowEnds).toISOString()}.`,
    '',
  ].join('\n');
  const summary = [
    overview,
    '| Key | LastModified (UTC) | Bytes |',
    '| --- | --- | ---: |',
    ...candidates.map(o => `| ${displayKey(o.Key)} | ${new Date(modified(o)).toISOString()} | ${o.Size} |`),
    '',
  ].join('\n');
  report(summary, overview);
  if (config.execute && now < windowEnds) throw new Error('Rollback window is still open');
  return candidates;
}

function run(argv, env, workflowEntry = false) {
  const config = options(env);
  if (argv.length !== 1) throw new Error('Usage: cleanup-bucket-assets.cjs --deployment | <freshly built checkout>');
  const target = argv[0];
  const workflow = target === '--workflow';
  if (workflow) {
    if (
      !workflowEntry ||
      env.GITHUB_ACTIONS !== 'true' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      env.GITHUB_WORKFLOW_REF !== WORKFLOW_REF ||
      env.GITHUB_JOB !== 'cleanup' ||
      !env.RUNNER_TEMP ||
      !path.isAbsolute(env.RUNNER_TEMP)
    ) {
      throw new Error('The workflow entry point requires the manual cleanup job on main');
    }
  } else if (config.execute) {
    throw new Error('Local cleanup is dry-run only. Use the manual cleanup workflow to execute.');
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-cleanup-'));
  try {
    const client = bucketClient(config.bucket, temp);
    if (target === '--deployment') {
      const { sha, version } = client.deployment();
      console.log(`sha=${sha}\nversion=${version}`);
      return;
    }
    const root = workflow ? path.join(env.RUNNER_TEMP, 'deployed') : path.resolve(target);
    const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const candidates = planCleanup({
      config,
      client,
      dist: path.join(root, 'dist'),
      sha,
      report: (fullReport, overview) => {
        console.log(fullReport);
        if (!env.GITHUB_STEP_SUMMARY) return;
        let summary = fullReport;
        if (Buffer.byteLength(fullReport) > PLAN_SUMMARY_BYTES) {
          const log = env.CLEANUP_JOB_URL ? `[job log](${env.CLEANUP_JOB_URL})` : 'step log';
          summary = `${overview}\nThe complete candidate table is in the ${log}, under **Verify live HTML and process candidates**.\n`;
        }
        fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary + '\n');
      },
    });
    return { bucket: config.bucket, execute: config.execute, keys: candidates.map(item => item.Key) };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

// Both entry points only read storage. The workflow owns the deletion loop.
function planForWorkflow() {
  return run(['--workflow'], process.env, true);
}

module.exports = { planCleanup, options, selectCandidates, deployment, planForWorkflow };

if (require.main === module) {
  try {
    run(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
