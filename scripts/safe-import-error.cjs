'use strict';

function safeValue(value) {
  const text = String(value || '');

  return /^[A-Za-z0-9_.-]{1,80}$/.test(text) ? text : null;
}

function safeMessage(value) {
  return String(value || '')
    .slice(0, 1000)
    .replace(/AQAD-[A-Za-z0-9_-]+|(?:Bearer\s+)?[A-Za-z0-9_-]{40,}/g, '[secret]')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[uuid]')
    .replace(/[+]?\d[\d\s().-]{6,}\d/g, '[number]')
    .replace(/@[A-Za-z0-9_]{3,}/g, '[username]')
    .replace(/[А-Яа-яЁё][А-Яа-яЁё\s-]+/g, '[text]')
    .replace(/(["'])[^"']+\1/g, '$1[redacted]$1');
}

function safeIssues(items, depth = 0) {
  if (!Array.isArray(items) || depth > 4) {
    return [];
  }

  return items.slice(0, 5).map(issue => ({
    code: safeValue(issue?.issueCode || issue?.code),
    severity: safeValue(issue?.severity),
    message: safeMessage(issue?.message),
    issues: safeIssues(issue?.issues, depth + 1),
  }));
}

function safeErrorDetails(error) {
  return {
    name: safeValue(error?.name),
    code: safeValue(error?.code),
    status: safeValue(error?.status),
    cause_name: safeValue(error?.cause?.name),
    cause_code: safeValue(error?.cause?.code),
    keys: Object.keys(error || {}).filter(key => /^[A-Za-z0-9_.-]{1,80}$/.test(key)),
    cause_keys: Object.keys(error?.cause || {}).filter(key => /^[A-Za-z0-9_.-]{1,80}$/.test(key)),
    issues: safeIssues(error?.cause?.issues),
  };
}

module.exports = { safeErrorDetails };
