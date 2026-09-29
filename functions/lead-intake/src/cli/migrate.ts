import { safeErrorFields } from '../observability/errors';
import { runMigrations } from '../ydb/migrations';

void runMigrations()
  .then(completed => {
    console.info(`YDB migrations complete; applied: ${completed.join(', ') || 'none'}`);
  })
  .catch((error: unknown) => {
    // safeErrorFields walks the cause chain and resolves gRPC/YDB numeric codes to
    // names, so a deploy failure names its cause instead of a bare `error.code`.
    const fields = safeErrorFields(error, { fallbackCode: 'ydb_migration_error' });
    console.error(`YDB migrations failed: ${JSON.stringify(fields)}`);
    process.exitCode = 1;
  });
