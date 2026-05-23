// Pre-`prisma migrate deploy` self-heal step.
//
// If a prior migration crashed mid-run, Prisma marks it as failed in
// `_prisma_migrations` and refuses to apply ANY further migrations (P3009),
// putting the server in a permanent crash loop on startup.
//
// This script clears the failed entry for migrations we have made idempotent
// (via `IF NOT EXISTS`/`WHERE ... IS NULL`), so the next `migrate deploy`
// will retry them safely. Migrations not listed here are left alone.

import pg from 'pg';

const HEALABLE_MIGRATIONS = [
  '20260523000000_add_alpha_unsubscribe_token',
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[heal-failed-migration] DATABASE_URL not set, skipping');
  process.exit(0);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const tableCheck = await client.query(
    "SELECT to_regclass('public._prisma_migrations') AS t",
  );
  if (!tableCheck.rows[0]?.t) {
    console.log('[heal-failed-migration] _prisma_migrations not present yet, skipping');
    process.exit(0);
  }

  const result = await client.query(
    `DELETE FROM _prisma_migrations
       WHERE migration_name = ANY($1::text[])
         AND finished_at IS NULL
       RETURNING migration_name`,
    [HEALABLE_MIGRATIONS],
  );

  if (result.rowCount > 0) {
    for (const row of result.rows) {
      console.log(`[heal-failed-migration] cleared failed entry: ${row.migration_name}`);
    }
  } else {
    console.log('[heal-failed-migration] no failed entries to clear');
  }
} catch (err) {
  console.error('[heal-failed-migration] error (continuing to migrate deploy):', err.message);
  process.exit(0);
} finally {
  await client.end().catch(() => {});
}
