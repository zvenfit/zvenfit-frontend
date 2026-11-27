'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const apiNames = ['lead', 'schedule', 'traffic'];
const configFiles = [...apiNames, 'maps'].map(name => 'js/' + name + '-config.js');

// Hash fixed-length file digests in this order so file boundaries are unambiguous.
function configDigest(read) {
  const digest = createHash('sha256');
  for (const key of configFiles) digest.update(createHash('sha256').update(read(key)).digest());
  return digest.digest('hex');
}

function deployedInputs(read, expectedDigest) {
  const files = new Map(configFiles.map(key => [key, read(key)]));
  if (expectedDigest !== undefined && configDigest(key => files.get(key)) !== expectedDigest) {
    throw new Error('Public runtime configs differ from the release metadata');
  }
  const inputs = {};
  for (const name of apiNames) {
    const key = 'js/' + name + '-config.js';
    const upper = name.toUpperCase();
    const prefix = 'window.ZVENFIT_' + upper + '_API = ';
    const js = files.get(key).toString('utf8');
    // Decode only the quoted string emitted by configScript. Never evaluate bucket code.
    const match = js.startsWith(prefix) && /^'((?:[^'\\\r\n]|\\['\\])+)';\n$/.exec(js.slice(prefix.length));
    if (!match) throw new Error('Invalid public runtime config: ' + key);
    inputs[upper + '_API_URL'] = match[1].replace(/\\(['\\])/g, '$1');
  }
  const maps = /^window\.ZVENFIT_MAPS = (\{[\s\S]*\});\n$/.exec(files.get('js/maps-config.js').toString('utf8'));
  try {
    inputs.Y_MAPS_API_KEY = JSON.parse(maps?.[1]).apiKey;
  } catch {
    throw new Error('Invalid public runtime config: js/maps-config.js');
  }
  if (typeof inputs.Y_MAPS_API_KEY !== 'string') throw new Error('Missing apiKey in js/maps-config.js');
  return inputs;
}

module.exports = { configDigest, deployedInputs };

if (require.main === module) {
  console.log(configDigest(key => fs.readFileSync(path.join(process.argv[2], key))));
}
