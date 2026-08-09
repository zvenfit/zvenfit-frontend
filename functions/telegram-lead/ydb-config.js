'use strict';

const DEFAULT_TABLE_NAME = 'leads';
const DEFAULT_RETENTION_DAYS = 1096;
const DEFAULT_QUERY_TIMEOUT_MS = 5000;
const DEFAULT_SLOW_OPERATION_MS = 1000;
const DEFAULT_SESSION_POOL_SIZE = 5;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validateIdentifier(value, errorCode) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,62}$/.test(value)) {
    throw new Error(errorCode);
  }

  return value;
}

function tableName() {
  const value = (process.env.YDB_LEADS_TABLE || DEFAULT_TABLE_NAME).trim();

  return validateIdentifier(value, 'invalid_ydb_table_name');
}

function migrationTableName() {
  return validateIdentifier(`${tableName()}_migrations`, 'invalid_ydb_migration_table_name');
}

function dueIndexName() {
  return 'idx_telegram_due';
}

function normalizeConnectionString(value) {
  const connectionString = (value || '').trim();

  if (!connectionString) {
    throw new Error('ydb_connection_string_missing');
  }

  const parsed = new URL(connectionString);
  const database = parsed.searchParams.get('database');

  if (!database) {
    return connectionString;
  }

  const databasePath = database.startsWith('/') ? database : `/${database}`;

  return `${parsed.protocol}//${parsed.host}${databasePath}`;
}

function retentionDays() {
  return parsePositiveInt(process.env.LEAD_RETENTION_DAYS, DEFAULT_RETENTION_DAYS);
}

function queryTimeoutMs() {
  return parsePositiveInt(process.env.YDB_QUERY_TIMEOUT_MS, DEFAULT_QUERY_TIMEOUT_MS);
}

function slowOperationMs() {
  return parsePositiveInt(process.env.YDB_SLOW_OPERATION_MS, DEFAULT_SLOW_OPERATION_MS);
}

function sessionPoolSize() {
  return Math.min(parsePositiveInt(process.env.YDB_SESSION_POOL_SIZE, DEFAULT_SESSION_POOL_SIZE), 50);
}

module.exports = {
  dueIndexName,
  migrationTableName,
  normalizeConnectionString,
  parsePositiveInt,
  queryTimeoutMs,
  retentionDays,
  sessionPoolSize,
  slowOperationMs,
  tableName,
  validateIdentifier,
};
