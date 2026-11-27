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

const { configDigest, deployedInputs } = require('./lib/deployed-site-config.cjs');

const { routeToUrl } = require('./check-routes.cjs');
const { gatewayPaths } = require('./generate-staging-gateway-spec.cjs');

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
  const digest = metadata['runtime-config-sha256'];
  if (digest !== undefined && !/^[0-9a-f]{64}$/.test(digest)) throw new Error('Invalid runtime config digest');
  return { sha, version, digest };
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
    contentType(key) {
      return JSON.parse(aws('head-object', '--key', key)).ContentType;
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

// A 404 is served at the missing request URL, which may be anywhere in the site.
class ErrorPageUrl extends URL {
  constructor(site, deployedKeys, files) {
    super('404.html', site.siteUrl);
    this.assetSuffixes = new Map();
    for (const key of deployedKeys) {
      if (!key.startsWith('_astro/') || files.has(key)) continue;
      for (let start = 0; start < key.length; ) {
        this.assetSuffixes.set(key.slice(start), key);
        const slash = key.indexOf('/', start);
        if (slash < 0) break;
        start = slash + 1;
      }
    }
  }

  referenceKind(value) {
    // For special URLs the browser accepts backslashes and same-scheme relative paths.
    const reference = String(value)
      .replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '')
      .replace(/[\t\r\n]/g, '');
    const scheme = reference.match(/^[a-z][a-z0-9+.-]*:/i)?.[0] ?? '';
    if (scheme && scheme.toLowerCase() !== this.protocol) return 'fixed';
    const rest = reference.slice(scheme.length);
    if (rest === '' || /^[?#]/.test(rest)) return 'same-document';
    return /^[/\\]/.test(rest) ? 'fixed' : 'relative';
  }

  requireFixedPath(value) {
    if (this.referenceKind(value) === 'relative')
      throw new Error('Cannot verify a path-relative URL on 404.html: ' + value);
  }
}

const storageHosts = new Set(['storage.yandexcloud.net', 'website.yandexcloud.net']);

function siteKey(value, base, site) {
  if (!URL.canParse(value, base)) return;
  const url = new URL(value, base);
  if (!['https:', 'http:'].includes(url.protocol)) return;
  // The production CDN redirects requests on the default HTTP port to HTTPS.
  if (
    site === PRODUCTION &&
    url.protocol === 'http:' &&
    !url.port &&
    site.allowedOrigins.includes('https://' + url.host)
  ) {
    url.protocol = 'https:';
  }
  let key;
  if (
    site.allowedOrigins.includes(url.origin) ||
    url.host === `${site.s3Bucket}.storage.yandexcloud.net` ||
    url.host === `${site.s3Bucket}.website.yandexcloud.net`
  ) {
    key = url.pathname.slice(1);
  } else if (storageHosts.has(url.host) && url.pathname.startsWith(`/${site.s3Bucket}/`)) {
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
  if (base instanceof ErrorPageUrl) base.requireFixedPath(value);
  const key = assetKey(value, base, site);
  if (key) refs.add(key);
}

// Unregistered custom properties keep their tokens until substitution. Resolve possible URLs
// at each var() use, after all stylesheets have been visited, including chains of aliases.
function cssAssetReferences(refs, site, deployedKeys) {
  const literals = new Map();
  const aliases = new Map();
  const consumers = new Map();

  function record(map, key, item) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(item);
  }

  function addPossibleUrl(value, base) {
    // Strings can also be font names or ordinary text. Only a matching bucket object is at risk.
    if (base instanceof ErrorPageUrl && base.referenceKind(value) === 'relative') {
      const key = base.assetSuffixes.get(siteKey(value, base, site));
      if (key) refs.add(key);
    } else {
      const key = assetKey(value, base, site);
      if (deployedKeys.has(key)) refs.add(key);
    }
  }

  function scan(value, context, base, visitCode, finalBase = base) {
    const ast = css.parse(value, { context, parseCustomProperty: true });
    css.walk(ast, function (node) {
      let property = this.declaration && css.ident.decode(this.declaration.property);
      if (
        property?.toLowerCase() === 'initial-value' &&
        css.ident.decode(this.atrule?.name ?? '').toLowerCase() === 'property'
      ) {
        const registered = this.atrule.prelude?.children?.first;
        if (registered?.type === 'Identifier') property = css.ident.decode(registered.name);
      }
      const custom = property?.startsWith('--');
      if (node.type === 'Raw') {
        // New CSS syntax may be retained as opaque text. Do not overlook a hidden URL or var().
        css.tokenize(node.value, (type, start, end) => {
          const fn =
            type === css.tokenTypes.Function && css.ident.decode(node.value.slice(start, end - 1)).toLowerCase();
          if (
            fn === 'var' ||
            (custom && (fn === 'url' || type === css.tokenTypes.Url || type === css.tokenTypes.String))
          )
            throw new Error('Cannot verify CSS custom property expression at ' + base.pathname);
        });
      } else if (node.type === 'Function' && css.ident.decode(node.name).toLowerCase() === 'var') {
        const name = node.children.first;
        if (name?.type !== 'Identifier') throw new Error('Cannot verify CSS var()');
        const dependency = css.ident.decode(name.name);
        if (custom) record(aliases, property, dependency);
        else {
          record(consumers, base, dependency);
          if (base !== finalBase) record(consumers, finalBase, dependency);
        }
      } else if (custom && (node.type === 'Url' || node.type === 'String')) {
        // An image-set() may receive its quoted URL from a custom property.
        record(literals, property, node.value);
        // Keep the declaration base too: a registered URL property can compute its value there.
        addPossibleUrl(node.value, base);
      } else if (
        node.type === 'String' &&
        this.function &&
        css.ident.decode(this.function.name).toLowerCase() === 'var'
      ) {
        addPossibleUrl(node.value, base);
        if (base !== finalBase) addPossibleUrl(node.value, finalBase);
      } else if (node.type === 'Atrule' && css.ident.decode(node.name).toLowerCase() === 'import') {
        let target = node.prelude?.children?.first;
        if (target?.type === 'Function' && css.ident.decode(target.name).toLowerCase() === 'url')
          target = target.children.first;
        if (!target || !['String', 'Url'].includes(target.type)) throw new Error('Cannot verify CSS @import');
        addAssetUrl(refs, target.value, base, site);
        visitCode(new URL(target.value, base), 'css');
      } else if (
        node.type === 'Url' ||
        (node.type === 'String' &&
          this.function &&
          ['url', 'image-set', '-webkit-image-set', 'image', 'src'].includes(
            css.ident.decode(this.function.name).toLowerCase(),
          ))
      ) {
        // A fragment-only paint server is part of the SVG document itself.
        if (context !== 'value' || !node.value.startsWith('#')) addAssetUrl(refs, node.value, base, site);
      }
    });
  }

  function resolve() {
    for (const [base, names] of consumers) {
      // Set iteration includes newly added aliases and visits each name once even in a cycle.
      for (const name of names) {
        for (const alias of aliases.get(name) ?? []) names.add(alias);
        for (const value of literals.get(name) ?? []) addPossibleUrl(value, base);
      }
    }
  }
  return { scan, resolve };
}

function addModuleReferences(source, base, importMap, visitCode) {
  const [imports] = parseImports(source);
  for (const { type, specifier, glob } of imports) {
    if (type === 'import-meta') continue;
    if (!specifier || glob) throw new Error(`Cannot verify a computed module import in ${base.pathname}`);
    if (base instanceof ErrorPageUrl && /^(?:\.\.?[/\\]|https:)/i.test(specifier)) base.requireFixedPath(specifier);
    const { resolvedImport } = importMaps.resolve(specifier, importMap, base);
    if (resolvedImport) visitCode(resolvedImport, 'module');
  }
}

// A classic script can load a site asset through Image, fetch, a worker, etc.
function addScriptLiterals(refs, tree, bases, scriptUrl, site, deployedKeys, inspectNode) {
  const errorBase = [...bases].find(base => base instanceof ErrorPageUrl);
  const assetBases = [...bases].filter(base => assetKey('.', base, site));
  const origin = new URL(site.siteUrl).origin;
  function visit(node) {
    if (inspectNode) inspectNode(node);
    const dynamic = ts.isTemplateExpression(node);
    const addition = ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
    if (dynamic || addition || ts.isStringLiteralLike(node)) {
      const { text: value, fixed } = addressPrefix(node, origin);
      const argument = enclosingArgument(node);
      const parent = argument.parent;
      // Module specifiers resolve against the module URL and are handled by addModuleReferences.
      if (
        parent.moduleSpecifier === argument ||
        (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword)
      )
        return;
      const urlArgs =
        ts.isNewExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 'URL'
          ? parent.arguments
          : undefined;
      if (urlArgs?.[1] === argument) return; // A base URL need not itself identify a file.
      let knownBase;
      const baseArg = urlArgs?.[1];
      if (baseArg && urlArgs[0] === argument) {
        const base = addressPrefix(baseArg, origin);
        if (base.fixed && URL.canParse(base.text)) knownBase = base.text;
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
      const fixedPath = fixed || /[?#]/.test(value);
      if (
        !fixedPath &&
        dynamic &&
        node.templateSpans.some(span => /(?:_|%5f)astro(?:\/|%2f)/i.test(span.literal.text))
      ) {
        if (!externalOrigin(value, scriptUrl, site))
          throw new Error('Cannot verify a computed asset URL in ' + scriptUrl.href);
      }
      if (
        errorBase &&
        (!knownBase || knownBase instanceof ErrorPageUrl) &&
        errorBase.referenceKind(value) === 'relative'
      ) {
        // Relative string literals may be DOM data or requests. At an unknown URL a
        // normalized suffix can address any matching old key, including in a subdirectory.
        const suffix = siteKey(value, errorBase, site);
        const missing = errorBase.assetSuffixes.get(suffix);
        if (fixedPath && missing)
          throw new Error('Incomplete dist: missing referenced asset ' + missing + ' (404.html)');
        if (!fixedPath && explicit) throw new Error('Cannot verify a path-relative asset URL on 404.html: ' + value);
      }
      if (fixedPath && !knownBase) {
        const workerKey = assetKey(value, scriptUrl, site);
        if (deployedKeys.has(workerKey)) refs.add(workerKey);
      }
      // Numeric arithmetic and other unknown additions need their operands inspected.
      const targets = knownBase ? [knownBase] : explicit ? bases : addition && !fixed ? [] : assetBases;
      for (const base of targets) {
        const key = assetKey(value, base, site);
        if (!key) continue;
        if (!fixedPath) throw new Error('Cannot verify a computed asset URL: ' + value);
        // Under an asset base ordinary strings can be event names or actual object keys.
        if (explicit || deployedKeys.has(key)) refs.add(key);
      }
      // Constant operands form one URL; a substring can name a different, stale object.
      if (addition && fixed) return;
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

// Return the fixed portion of a request before its first runtime substitution.
function addressPrefix(node, origin) {
  if (ts.isStringLiteralLike(node)) return { text: node.text, fixed: true };
  if (
    ts.isPropertyAccessExpression(node) &&
    /^(?:(?:window|self|globalThis)\.)?location\.origin$/.test(node.getText())
  ) {
    return { text: origin, fixed: true };
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const part = addressPrefix(span.expression, origin);
      text += part.text;
      if (!part.fixed) return { text, fixed: false };
      text += span.literal.text;
    }
    return { text, fixed: true };
  }
  if (ts.isParenthesizedExpression(node)) return addressPrefix(node.expression, origin);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = addressPrefix(node.left, origin);
    if (!left.fixed) return left;
    const right = addressPrefix(node.right, origin);
    return { text: left.text + right.text, fixed: right.fixed };
  }
  return { text: '', fixed: false };
}

function externalOrigin(prefix, base, site) {
  if (!/^(?:https?:)?\/\/[^/]+\//i.test(prefix)) return false;
  const url = new URL(prefix, base);
  return !storageHosts.has(url.host) && siteKey(url, base, site) === undefined;
}

function workerAddress(node, base, scriptUrl, site) {
  if (ts.isNewExpression(node) && node.expression.text === 'Request' && node.arguments?.length) {
    return workerAddress(node.arguments[0], base, scriptUrl, site);
  }
  if (ts.isNewExpression(node) && node.expression.text === 'URL' && node.arguments?.length === 2) {
    const [address, relativeTo] = node.arguments;
    if (relativeTo.getText() === 'import.meta.url') return workerAddress(address, scriptUrl, scriptUrl, site);
    const prefix = addressPrefix(relativeTo, base.origin);
    if (prefix.fixed) return workerAddress(address, new URL(prefix.text), scriptUrl, site);
  }
  const { text, fixed } = addressPrefix(node, base.origin);
  if (fixed || /[?#]/.test(text)) {
    if (base instanceof ErrorPageUrl) base.requireFixedPath(text);
    return new URL(text, base);
  }
  // Only a complete external origin is independent of the runtime filename.
  // Locally imported worker code can use an asset regardless of its own directory.
  if (externalOrigin(text, base, site)) return;
  throw new Error('Cannot verify a computed asset URL in ' + scriptUrl.href);
}

// Let TypeScript resolve container aliases and destructuring against the DOM library.
// This program is local to a script that uses registration; it never emits or follows imports.
function registrationChecker(sourceFile) {
  const options = {
    allowJs: true,
    noResolve: true,
    strictBindCallApply: true,
    strictNullChecks: true,
    noEmit: true,
    types: [],
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...args) => (name === sourceFile.fileName ? sourceFile : getSourceFile(name, ...args));
  return ts.createProgram([sourceFile.fileName], options, host).getTypeChecker();
}

function memberName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
    return node.argumentExpression.text;
}

function enclosingArgument(node) {
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  return node;
}

function isWorkerMethod(declaration) {
  return declaration?.name?.text === 'register' && declaration.parent.name?.text === 'ServiceWorkerContainer';
}

// Inspect the registration method where it is obtained. After a callable escapes
// into another script, inspecting the eventual call cannot establish its identity.
function registrationTarget(node, getChecker) {
  const binding = ts.isBindingElement(node) && (node.propertyName ?? node.name).text === 'register';
  let name = memberName(node);
  if (!binding && ts.isElementAccessExpression(node) && name === undefined) {
    const key = addressPrefix(node.argumentExpression, '');
    if (key.fixed) name = key.text;
    else if (ts.isNumericLiteral(node.argumentExpression)) return;
    else {
      const checker = getChecker();
      const keyType = checker.getTypeAtLocation(node.argumentExpression);
      const possibilities = keyType.isUnion() ? keyType.types : [keyType];
      if (possibilities.every(part => part.isLiteral())) {
        if (!possibilities.some(part => part.value === 'register')) return;
        name = 'register';
      } else {
        const receiver = checker.getTypeAtLocation(node.expression);
        const receivers = receiver.isUnion() ? receiver.types : [receiver];
        if (receivers.some(part => part.getProperty('register')?.declarations?.some(isWorkerMethod))) {
          throw new Error('Cannot verify a computed service worker property');
        }
        return;
      }
    }
  }
  if (!binding && name !== 'register') return;
  const type = getChecker().getTypeAtLocation(binding ? node.name : node);
  const possibleWorker = (type.isUnion() ? type.types : [type]).some(
    part =>
      part.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) ||
      part.getCallSignatures().some(sig => isWorkerMethod(sig.declaration)),
  );
  if (!possibleWorker) return;
  const ref = enclosingArgument(node);
  const use = ref.parent;
  if (
    ts.isTypeOfExpression(use) ||
    ts.isIfStatement(use) ||
    (ts.isPrefixUnaryExpression(use) && use.operator === ts.SyntaxKind.ExclamationToken)
  )
    return;
  if (
    ts.isBinaryExpression(use) &&
    use.left === ref &&
    [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(use.operatorToken.kind)
  )
    return;
  if (ts.isCallExpression(use) && use.expression === ref) return use.arguments[0];
  if (use.expression === ref) {
    const adapter = memberName(use);
    const method = enclosingArgument(use);
    const call = method.parent;
    if (ts.isCallExpression(call) && call.expression === method) {
      if (adapter === 'call') return call.arguments[1];
      if (adapter === 'apply' && call.arguments[1] && ts.isArrayLiteralExpression(call.arguments[1]))
        return call.arguments[1].elements[0];
      if (adapter === 'bind') {
        if (call.arguments[1]) return call.arguments[1];
        const bound = enclosingArgument(call);
        if (ts.isCallExpression(bound.parent) && bound.parent.expression === bound) return bound.parent.arguments[0];
      }
    }
  }
  throw new Error('Cannot verify an indirect service worker registration without a script URL');
}

// A shared script can run under many document bases. Parse and type-check its
// registrations once; resolve the returned argument nodes in each loading context.
function scriptCache() {
  const scripts = new Map();
  return source => {
    if (!scripts.has(source)) {
      const tree = ts.createSourceFile('asset.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      let targets;
      scripts.set(source, {
        tree,
        registrations() {
          if (targets) return targets;
          targets = new Map();
          let checker;
          const getChecker = () => (checker ??= registrationChecker(tree));
          function visit(node) {
            const target = registrationTarget(node, getChecker);
            if (target) targets.set(node, target);
            ts.forEachChild(node, visit);
          }
          visit(tree);
          return targets;
        },
      });
    }
    return scripts.get(source);
  };
}

// Each document has its own import map. Follow its modules and CSS imports with
// their actual URLs, including when the same script runs under different maps.
function codeGraph(refs, site, readVerifiedText, importedFiles, documentBase, deployedKeys, scriptFor, scanCss) {
  const seen = new Set();
  let importMap = {};
  const entries = [];
  let parsingBase = documentBase;
  function inspectWorkerCalls(source, scriptUrl, workerBase) {
    const bases = workerBase ? [workerBase] : [...new Set([parsingBase, documentBase])];
    const script = scriptFor(source);
    const registrations = script.registrations();
    addScriptLiterals(refs, script.tree, bases, scriptUrl, site, deployedKeys, node => {
      const registration = registrations.get(node);
      const call = ts.isCallExpression(node) || ts.isNewExpression(node);
      const api = call && (memberName(node.expression) ?? node.expression.text);
      const entryArgument =
        registration || (ts.isNewExpression(node) && ['Worker', 'SharedWorker'].includes(api) && node.arguments?.[0]);
      if (entryArgument) {
        for (const base of bases) {
          const entry = workerAddress(entryArgument, base, scriptUrl, site);
          if (entry) visitCode(entry, 'js', entry);
        }
      } else if (workerBase && call && node.arguments?.length) {
        const [first, second] = node.arguments;
        let requests;
        if (api === 'importScripts') requests = node.arguments;
        else if (['fetch', 'Request', 'EventSource'].includes(api)) requests = [first];
        else if (api === 'open' && second) {
          // XHR.open takes the method first. IndexedDB.open takes a database name and version.
          const receiver = node.expression.expression;
          if (receiver?.getText().split('.').at(-1) === 'indexedDB') return;
          requests = [second];
        } else return;
        for (const argument of requests) {
          const address = workerAddress(argument, workerBase, scriptUrl, site);
          if (!address) continue;
          if (api === 'importScripts') visitCode(address, 'js', workerBase);
          else addAssetUrl(refs, address, workerBase, site);
        }
      }
    });
  }
  function visitCode(url, kind, workerBase) {
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Cannot verify ' + url.protocol + ' ' + kind + ' dependency');
    }
    const key = siteKey(url, url, site);
    if (key === undefined) return;
    if (key.startsWith('_astro/')) refs.add(key);
    const identity = JSON.stringify([kind, url.href, parsingBase.href, workerBase?.href]);
    if (seen.has(identity)) return;
    seen.add(identity);
    const source = readVerifiedText(key);
    if (kind === 'css' || (kind === 'module' && /\.css$/i.test(key))) {
      scanCss(source, 'stylesheet', url, visitCode);
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
      parsingBase = entry.base;
      if (entry.url) visitCode(entry.url, entry.kind);
      else {
        addModuleReferences(entry.source, parsingBase, importMap, visitCode);
        inspectWorkerCalls(entry.source, parsingBase);
      }
    }
  }
  return {
    visitCode,
    entries,
    runEntries,
    addMap(source, base) {
      // Earlier code may run before registration, or import later after it.
      runEntries();
      seen.clear();
      if (base instanceof ErrorPageUrl) {
        const map = JSON.parse(source);
        // Even an absolute scope can match some missing request paths but not others.
        if (Object.keys(map.scopes ?? {}).length) throw new Error('Cannot verify scoped import map on 404.html');
        for (const [specifier, target] of Object.entries(map.imports ?? {})) {
          if (/^(?:\.\.?[/\\]|https:)/i.test(specifier)) base.requireFixedPath(specifier);
          if (typeof target === 'string') base.requireFixedPath(target);
        }
      }
      const next = importMaps.parseFromString(source, base);
      const merge = (earlier, later) =>
        Object.fromEntries(Object.entries({ ...later, ...earlier }).sort(([a], [b]) => (a < b ? 1 : -1)));
      const scopes = merge(importMap.scopes, next.scopes);
      for (const key of Object.keys(scopes)) scopes[key] = merge(importMap.scopes?.[key], next.scopes?.[key]);
      importMap = { imports: merge(importMap.imports, next.imports), scopes };
    },
  };
}

function addReferences(
  refs,
  document,
  pageUrl,
  { site, deployedKeys, readVerifiedText, importedFiles, scriptFor, checkNavigation, checkManifest, scanCss },
) {
  const route = pageUrl.pathname.slice(1) || '/';
  function firstBase(node) {
    if (
      node.tagName === 'base' &&
      node.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
      node.attrs.some(attr => attr.name === 'href')
    )
      return node;
    if (node.tagName === 'noscript') return;
    for (const child of node.childNodes ?? []) {
      const found = firstBase(child);
      if (found) return found;
    }
  }
  const baseTag = firstBase(document);
  const href = baseTag?.attrs.find(attr => attr.name === 'href')?.value;
  if (pageUrl instanceof ErrorPageUrl && href) pageUrl.requireFixedPath(href);
  const sameDocument = pageUrl instanceof ErrorPageUrl && pageUrl.referenceKind(href ?? '') === 'same-document';
  const finalBase = href && !sameDocument && URL.canParse(href, pageUrl) ? new URL(href, pageUrl) : pageUrl;
  const graph = codeGraph(refs, site, readVerifiedText, importedFiles, finalBase, deployedKeys, scriptFor, scanCss);
  if (!['https:', 'http:'].includes(finalBase.protocol)) throw new Error('Cannot verify document base in ' + route);
  const baseOffset = baseTag?.sourceCodeLocation?.startOffset ?? Infinity;
  // URL attributes can contain spaces, parentheses, commas and HTML entities.
  function scan(value, addUrl) {
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
    // Parser-triggered loads use the base available at their position in the input.
    const base = node.sourceCodeLocation?.startOffset >= baseOffset ? finalBase : pageUrl;
    const addUrl = value => addAssetUrl(refs, value, base, site);
    const attributes = node.attrs ?? [];
    const attrs = Object.fromEntries(
      attributes.map(({ prefix, name, value }) => [prefix ? prefix + ':' + name : name, value]),
    );
    // srcdoc creates another document with its own base and script context.
    if (node.tagName === 'iframe' && Object.hasOwn(attrs, 'srcdoc') && attrs.srcdoc.trim()) {
      throw new Error('Cannot verify iframe[srcdoc] in ' + route);
    }
    const embedded =
      node.tagName === 'object' ? attrs.data : ['iframe', 'embed', 'frame'].includes(node.tagName) && attrs.src;
    if (embedded && URL.canParse(embedded, base)) {
      if (new URL(embedded, base).protocol === 'data:') throw new Error('Cannot verify embedded data URL in ' + route);
      // The content type can select an active document even for an extensionless URL.
      if (siteKey(embedded, base, site) !== undefined || siteKey(embedded, finalBase, site) !== undefined) {
        throw new Error('Cannot verify local embedded document in ' + route);
      }
    }
    if (node.tagName === 'meta' && attrs['http-equiv']?.trim().toLowerCase() === 'refresh' && attrs.content?.trim()) {
      throw new Error('Cannot verify meta refresh in ' + route);
    }
    const html = node.namespaceURI === 'http://www.w3.org/1999/xhtml';
    const svg = node.namespaceURI === 'http://www.w3.org/2000/svg';
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
    if (node.tagName === 'script') {
      const source = svg ? (attrs.href ?? attrs['xlink:href']) : attrs.src;
      if (source) graph.entries.push({ url: new URL(source, base), kind: 'js', base });
    }
    if (node.tagName === 'link' && attrs.href) {
      if (rel.includes('manifest')) {
        checkManifest(attrs.href, base);
        if (base !== finalBase) checkManifest(attrs.href, finalBase);
      }
      const preload = rel.includes('preload') && attrs.as?.toLowerCase();
      const style = rel.includes('stylesheet') || preload === 'style';
      if (style || rel.includes('modulepreload') || preload === 'script') {
        graph.entries.push({ url: new URL(attrs.href, base), kind: style ? 'css' : 'js', base });
      }
    }
    for (const { name, value, prefix } of attributes) {
      // SVG 2 gives the unqualified href precedence, independent of attribute order.
      if (svg && prefix === 'xlink' && name === 'href' && attrs.href !== undefined) continue;
      if (node.tagName === 'base' && name === 'href') continue;
      if (name === 'style') {
        scanCss(value, 'declarationList', base, graph.visitCode, finalBase);
      } else if (
        name === 'background' &&
        html &&
        ['body', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'].includes(node.tagName)
      ) {
        addUrl(value);
        if (base !== finalBase) addAssetUrl(refs, value, finalBase, site);
      } else if (name.startsWith('on') && value.trim()) {
        graph.entries.push({ source: value, base });
        if (base !== finalBase) graph.entries.push({ source: value, base: finalBase });
      } else if (['href', 'src', 'poster', 'data', 'action', 'formaction'].includes(name)) {
        const scheme = URL.parse(value, base)?.protocol;
        if (['data:', 'javascript:', 'vbscript:'].includes(scheme)) {
          // An img decodes a data URL as an image, without creating a document or running a script.
          const inlineImage = scheme === 'data:' && node.tagName === 'img' && name === 'src';
          if (!inlineImage) throw new Error('Cannot verify ' + scheme + ' URL in ' + route);
        }
        addUrl(value);
        // A visitor can navigate after a later base takes effect.
        if (['action', 'formaction'].includes(name) || (name === 'href' && ['a', 'area'].includes(node.tagName))) {
          checkNavigation(siteKey(value, base, site));
          if (base !== finalBase) {
            addAssetUrl(refs, value, finalBase, site);
            checkNavigation(siteKey(value, finalBase, site));
          }
        }
      } else if (svg && /[(\\]/.test(value) && (name === 'color-profile' || css.lexer.getProperty(name))) {
        scanCss(value, 'value', base, graph.visitCode);
        if (base !== finalBase) scanCss(value, 'value', finalBase, graph.visitCode);
      } else if (name === 'srcset' || name === 'imagesrcset') {
        // A candidate starts at the beginning or after a separator. Commas
        // inside its URL are legal; trailing commas delimit descriptorless URLs.
        for (const match of value.matchAll(/(?:^|(?<=,))\s*([^,\s]\S*)/g)) addUrl(match[1].replace(/,+$/, ''));
      } else {
        scan(value, addUrl);
      }
    }
    if (node.nodeName === '#text') {
      if (node.parentNode?.tagName === 'style') {
        scanCss(node.value, 'stylesheet', base, graph.visitCode, finalBase);
      } else if (node.parentNode?.tagName === 'script') {
        const type =
          node.parentNode.attrs
            .find(attr => attr.name === 'type')
            ?.value.trim()
            .toLowerCase() || '';
        if (!type || type === 'module' || /(?:java|ecma)script/.test(type)) {
          // Dynamic import() is also valid in classic scripts.
          graph.entries.push({ source: node.value, base });
        } else if (type === 'importmap') graph.addMap(node.value, base);
        else scan(node.value, addUrl);
      } else scan(node.value, addUrl);
    }
    for (const child of node.childNodes ?? []) visit(child);
    if (node.content) visit(node.content);
  }
  visit(document);
  graph.runEntries();
  return finalBase.href;
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
  const verifiedText = new Map();
  const importedFiles = new Set();
  const scriptFor = scriptCache();
  const checkedNavigations = new Set();
  function checkNavigation(key) {
    if (!deployedKeys.has(key) || pages.has(key) || checkedNavigations.has(key)) return;
    // SVG opened by a link is a document. Extensionless objects can have the same media type.
    if (/\.svgz?$/i.test(key)) throw new Error('Cannot verify navigable SVG document: ' + key);
    const type = client.contentType(key)?.split(';', 1)[0].trim().toLowerCase();
    if (!type || type === 'text/html' || type.endsWith('/xml') || type.endsWith('+xml')) {
      throw new Error('Cannot verify navigable document: ' + key);
    }
    checkedNavigations.add(key);
  }
  function readVerifiedText(key, kind = 'code') {
    if (!files.has(key)) throw new Error(`Incomplete dist: missing referenced asset ${key}`);
    if (!deployedKeys.has(key)) throw new Error(`Incomplete deployment: missing bucket object ${key}`);
    if (!verifiedText.has(key)) {
      const built = fs.readFileSync(path.join(dist, key));
      if (!built.equals(client.readAsset(key))) throw new Error(`Live ${kind} differs from dist: ${key}`);
      verifiedText.set(key, built.toString('utf8'));
    }
    return verifiedText.get(key);
  }
  const checkedManifests = new Set();
  function checkManifest(href, base) {
    if (base instanceof ErrorPageUrl) base.requireFixedPath(href);
    const url = new URL(href, base);
    if (checkedManifests.has(url.href)) return;
    const key = siteKey(url, url, site);
    if (key === undefined) throw new Error('Cannot verify external web manifest on ' + base.pathname);
    const source = readVerifiedText(key, 'manifest');
    let manifest;
    try {
      manifest = JSON.parse(source.replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('Invalid web manifest: ' + key);
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
      throw new Error('Invalid web manifest: ' + key);
    function visit(object) {
      for (const [member, value] of Object.entries(object)) {
        if (value && typeof value === 'object') visit(value);
        else if (typeof value === 'string' && ['src', 'url', 'start_url', 'action'].includes(member)) {
          // Image resources can also occur in shortcuts, screenshots and localized lists.
          addAssetUrl(builtRefs, value, url, site);
          if (member !== 'src') checkNavigation(siteKey(value, url, site));
        }
      }
    }
    visit(manifest);
    checkedManifests.add(url.href);
  }
  if (release.digest !== undefined) {
    if (configDigest(readVerifiedText) !== release.digest)
      throw new Error('Public runtime configs differ from the release metadata');
  } else if (config.execute) {
    throw new Error('Missing runtime config digest. Deploy the site with release metadata before executing cleanup.');
  }
  const styles = cssAssetReferences(builtRefs, site, deployedKeys);
  const scanCss = styles.scan;
  const review = {
    site,
    deployedKeys,
    readVerifiedText,
    importedFiles,
    scriptFor,
    checkNavigation,
    checkManifest,
    scanCss,
  };
  let lastHtml = 0;
  for (const object of htmlObjects) {
    const page = client.readHtml(object.Key);
    if (
      page.release.sha !== sha ||
      page.release.version !== release.version ||
      page.release.digest !== release.digest
    ) {
      throw new Error(`Mixed deployment on ${object.Key}. Check the last site deployment.`);
    }
    lastHtml = Math.max(lastHtml, modified(object));
    // Byte equality proves even references embedded in inline code match the build.
    const builtHtml = fs.readFileSync(path.join(dist, object.Key));
    if (!builtHtml.equals(page.html)) throw new Error(`Live HTML differs from dist: ${object.Key}`);
    const route = routeToUrl('', object.Key);
    const paths = new Set(['/' + object.Key, ...(site === STAGING ? gatewayPaths(route) : [route])]);
    const document = parse(builtHtml.toString('utf8'), { scriptingEnabled: false, sourceCodeLocationInfo: true });
    for (const pathname of paths) {
      const pageUrl =
        object.Key === '404.html' ? new ErrorPageUrl(site, deployedKeys, files) : new URL(pathname, site.siteUrl);
      documentBases.add(addReferences(builtRefs, document, pageUrl, review));
    }
  }
  if (!builtRefs.size) throw new Error('No /_astro/ references in dist');
  const fallback = codeGraph(
    builtRefs,
    site,
    readVerifiedText,
    importedFiles,
    new URL(site.siteUrl),
    deployedKeys,
    scriptFor,
    scanCss,
  );
  for (const key of files) {
    if (key.startsWith(config.prefix) && !deployedKeys.has(key))
      throw new Error(`Incomplete deployment: missing bucket object ${key}`);
    const fileUrl = new URL(key, site.siteUrl);
    if (/\.m?js$/i.test(key)) {
      const source = fs.readFileSync(path.join(dist, key), 'utf8');
      if (!importedFiles.has(key)) addModuleReferences(source, fileUrl, {}, fallback.visitCode);
      addScriptLiterals(builtRefs, scriptFor(source).tree, documentBases, fileUrl, site, deployedKeys);
    } else if (/\.css$/i.test(key)) {
      scanCss(fs.readFileSync(path.join(dist, key), 'utf8'), 'stylesheet', fileUrl, fallback.visitCode);
    }
  }
  styles.resolve();
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
  const target = argv[0];
  if (argv.length !== (target === '--rebuild' ? 2 : 1)) {
    throw new Error('Usage: cleanup-bucket-assets.cjs --deployment | --rebuild <fresh checkout> | <built checkout>');
  }
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
    if (target === '--rebuild') {
      const root = path.resolve(argv[1]);
      const { sha, version, digest } = client.deployment();
      if (execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== sha) {
        throw new Error('The checkout SHA differs from the deployed SHA');
      }
      const inputs = deployedInputs(client.readAsset, digest);
      execFileSync('bash', [path.join(__dirname, 'rebuild-cleanup-site.sh'), root], {
        env: { ...env, ...inputs, ASSET_VERSION: version, NODE_ENV: config.environment },
        stdio: 'inherit',
      });
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
