'use strict';

/* eslint-disable @typescript-eslint/no-var-requires, no-console */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { safeErrorDetails } = require('./safe-import-error.cjs');

const DEFAULT_SOURCE_KEY = 'zvenfit-leads-import';
const FIELD_LABELS = {
  Имя: 'name',
  Телефон: 'phone',
  'Способ связи': 'contactMethod',
  Телеграм: 'telegramUsername',
};
const UTM_LABELS = {
  source: 'utm_source',
  medium: 'utm_medium',
  campaign: 'utm_campaign',
  term: 'utm_term',
  content: 'utm_content',
  yclid: 'yclid',
  gclid: 'gclid',
  fbclid: 'fbclid',
};

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function textFromHtml(value) {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ''));
}

function parseTelegramDate(value) {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2}) UTC([+-]\d{2}:\d{2})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year, hours, minutes, seconds, offset] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deterministicUuid(sourceKey, messageId) {
  const bytes = crypto.createHash('sha256').update(`${sourceKey}:${messageId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseLeadBlock(block, sourceKey) {
  const idMatch = block.match(/\bid="message(\d+)"/);
  const dateMatch = block.match(/class="pull_right date details"\s+title="([^"]+)"/);
  const textMatch = block.match(/<div class="text">([\s\S]*?)<\/div>/);

  if (!idMatch || !dateMatch || !textMatch) {
    return { error: 'incomplete_message_structure', messageId: idMatch?.[1] || null };
  }

  const messageId = idMatch[1];
  const createdAt = parseTelegramDate(decodeHtml(dateMatch[1]));
  const lines = textFromHtml(textMatch[1])
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines[0] !== 'Новая заявка') {
    return { ignored: true };
  }

  if (!createdAt) {
    return { error: 'invalid_message_date', messageId };
  }

  const lead = {
    leadId: deterministicUuid(sourceKey, messageId),
    createdAt,
    notifiedAt: createdAt,
    name: '',
    phone: '',
    contactMethod: '',
    telegramUsername: '',
    utm: {},
  };

  for (const line of lines.slice(1)) {
    const separator = line.indexOf(':');
    if (separator < 0) {
      continue;
    }

    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    const field = FIELD_LABELS[label];
    const utmField = UTM_LABELS[label];

    if (field) {
      lead[field] = value;
    } else if (utmField && value) {
      lead.utm[utmField] = value;
    }
  }

  if (!lead.name || !lead.phone || !lead.contactMethod) {
    return { error: 'required_field_missing', messageId };
  }

  return { lead, messageId };
}

function parseTelegramExport(html, sourceKey = DEFAULT_SOURCE_KEY) {
  const chunks = html.split(/(?=<div class="message (?:default clearfix|service)\b)/);
  const leads = [];
  const errors = [];
  const seenMessageIds = new Set();

  for (const chunk of chunks) {
    if (!chunk.startsWith('<div class="message default clearfix')) {
      continue;
    }

    const parsed = parseLeadBlock(chunk, sourceKey);
    if (parsed.ignored) {
      continue;
    }
    if (parsed.error) {
      errors.push({ messageId: parsed.messageId, code: parsed.error });
      continue;
    }
    if (seenMessageIds.has(parsed.messageId)) {
      errors.push({ messageId: parsed.messageId, code: 'duplicate_message_id' });
      continue;
    }

    seenMessageIds.add(parsed.messageId);
    leads.push(parsed.lead);
  }

  leads.sort((left, right) => left.createdAt - right.createdAt);

  return { leads, errors };
}

function parseArgs(argv) {
  const options = {
    apply: false,
    file: '',
    sourceKey: DEFAULT_SOURCE_KEY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--apply') {
      options.apply = true;
    } else if (argument === '--file') {
      options.file = argv[index + 1] || '';
      index += 1;
    } else if (argument === '--source-key') {
      options.sourceKey = argv[index + 1] || '';
      index += 1;
    } else if (!argument.startsWith('--') && !options.file) {
      options.file = argument;
    } else {
      throw new Error(`unknown_argument:${argument}`);
    }
  }

  if (!options.file) {
    throw new Error('export_file_required');
  }
  if (!options.sourceKey.trim()) {
    throw new Error('source_key_required');
  }

  return options;
}

function buildSummary(parsed) {
  const withUtm = parsed.leads.filter(lead => Object.keys(lead.utm).length > 0).length;
  const withTelegramUsername = parsed.leads.filter(lead => lead.telegramUsername).length;

  return {
    parsed: parsed.leads.length,
    rejected: parsed.errors.length,
    with_utm: withUtm,
    with_telegram_username: withTelegramUsername,
    first_created_at: parsed.leads[0]?.createdAt.toISOString() || null,
    last_created_at: parsed.leads.at(-1)?.createdAt.toISOString() || null,
    error_codes: parsed.errors.reduce((counts, error) => {
      counts[error.code] = (counts[error.code] || 0) + 1;

      return counts;
    }, {}),
  };
}

async function importLeads(leads) {
  if (!process.env.YDB_CONNECTION_STRING) {
    throw new Error('ydb_connection_string_missing');
  }
  if (!process.env.YDB_ACCESS_TOKEN_CREDENTIALS) {
    throw new Error('ydb_access_token_credentials_missing');
  }

  const store = require('../functions/lead-intake/build/ydb/lead-store');
  const result = { inserted: 0, existing: 0, existing_sent: 0, existing_other: 0 };

  try {
    for (const lead of leads) {
      const saved = await store.importDeliveredLead(lead);
      if (saved.created) {
        result.inserted += 1;
      } else {
        result.existing += 1;
        if (saved.telegramStatus === 'sent') {
          result.existing_sent += 1;
        } else {
          result.existing_other += 1;
        }
      }
    }
  } finally {
    await store.close();
  }

  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const exportPath = path.resolve(options.file);
  const html = fs.readFileSync(exportPath, 'utf8');
  const parsed = parseTelegramExport(html, options.sourceKey);
  const summary = buildSummary(parsed);

  if (parsed.errors.length > 0) {
    console.log(JSON.stringify({ mode: 'dry-run', ...summary }, null, 2));
    process.exitCode = 2;

    return;
  }

  if (!options.apply) {
    console.log(JSON.stringify({ mode: 'dry-run', ...summary }, null, 2));

    return;
  }

  const imported = await importLeads(parsed.leads);
  console.log(JSON.stringify({ mode: 'apply', ...summary, ...imported }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    const safeCodes = new Set([
      'export_file_required',
      'source_key_required',
      'ydb_access_token_credentials_missing',
      'ydb_connection_string_missing',
    ]);
    const code =
      safeCodes.has(error.message) || error.message.startsWith('unknown_argument:')
        ? error.message
        : 'lead_import_failed';
    console.error(JSON.stringify({ ok: false, error: code, details: safeErrorDetails(error) }));
    process.exitCode = 1;
  });
}

module.exports = {
  buildSummary,
  deterministicUuid,
  parseArgs,
  parseTelegramDate,
  parseTelegramExport,
};
