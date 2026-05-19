'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(publicDir)) {
  console.error('build-static: missing directory public/');
  process.exit(1);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.cpSync(publicDir, distDir, { recursive: true });

const leadApiUrl = process.env.LEAD_API_URL || '';
const leadConfigPath = path.join(distDir, 'js', 'lead-config.js');

if (fs.existsSync(leadConfigPath)) {
  const leadConfig = fs.readFileSync(leadConfigPath, 'utf8');
  fs.writeFileSync(leadConfigPath, leadConfig.replaceAll('__LEAD_API_URL__', leadApiUrl), 'utf8');
}

if (!leadApiUrl) {
  console.warn('build-static: LEAD_API_URL is empty — lead form will fail until it is set');
} else {
  console.log('build-static: LEAD_API_URL injected into js/lead-config.js');
}

console.log('build-static: copied public/ -> dist/');
