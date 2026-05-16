'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

const PAGE_PATHS = [
  'fitnes-club',
  'pilates-na-reformere',
  'gruppovye-trenirovki',
  'forma-dlya-zayavki',
  'offer',
  'privacy',
  'payment-policy',
  'coaches/trenery',
  'coaches/trener-elena',
  'coaches/trener-anna',
  'coaches/trener-oleg',
  'coaches/trener-olga',
  'coaches/trener-oksana',
  'coaches/trener-ella',
  'pilates/pilates-individual',
  'pilates/pilates-gruppa',
  'fitnes/fitnes-individual',
  'fitnes/fitnes-split',
  'fitnes/fitnes-split-copy',
];

function collectHtmlFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'css' || ent.name === 'js') continue;
      out.push(...collectHtmlFiles(full));
    } else if (ent.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function movePagesIntoDirectories() {
  const files = collectHtmlFiles(publicDir);
  for (const file of files) {
    const base = path.basename(file, '.html');
    if (base === 'index') continue;

    const targetDir = path.join(path.dirname(file), base);
    const targetFile = path.join(targetDir, 'index.html');
    if (file === targetFile) continue;

    if (!fs.existsSync(file)) continue;

    if (fs.existsSync(targetFile)) {
      console.error(`migrate: refuse to overwrite existing ${path.relative(rootDir, targetFile)}`);
      process.exit(1);
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.renameSync(file, targetFile);
    console.log('migrate: moved', path.relative(rootDir, file), '->', path.relative(rootDir, targetFile));
  }
}

function rewriteHtml(html) {
  let out = html;

  out = out.replace(/https:\/\/zvenfit\.ru\/([^"'?#\s]+)\.html/g, (full, slug) => {
    if (!slug || slug.includes('//')) return full;
    return `https://zvenfit.ru/${slug}/`;
  });

  const pairs = [];

  for (const p of PAGE_PATHS) {
    pairs.push([`../../${p}.html`, `/${p}/`]);
    pairs.push([`../${p}.html`, `/${p}/`]);
    pairs.push([`${p}.html`, `/${p}/`]);
  }
  pairs.push(['../../index.html', '/']);
  pairs.push(['../index.html', '/']);
  pairs.sort((a, b) => b[0].length - a[0].length);

  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }

  out = out.replace(/href="index\.html"/g, 'href="/"');
  out = out.replace(/href='index\.html'/g, "href='/'");

  out = out.replace(/href="\.\.\/\.\.\/css\//g, 'href="/css/');
  out = out.replace(/href="\.\.\/css\//g, 'href="/css/');
  out = out.replace(/href="css\//g, 'href="/css/');

  out = out.replace(/src="\.\.\/\.\.\/js\//g, 'src="/js/');
  out = out.replace(/src="\.\.\/js\//g, 'src="/js/');
  out = out.replace(/src="js\//g, 'src="/js/');

  return out;
}

function rewriteAllHtmlFiles() {
  for (const file of collectHtmlFiles(publicDir)) {
    const before = fs.readFileSync(file, 'utf8');
    const after = rewriteHtml(before);
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      console.log('migrate: rewritten', path.relative(rootDir, file));
    }
  }
}

movePagesIntoDirectories();
rewriteAllHtmlFiles();
console.log('migrate: done');
