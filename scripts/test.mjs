/**
 * Test runner.
 *
 * 1. points DATABASE_URL at TEST_DATABASE_URL (a separate database — the suite
 *    truncates every table, so it must never touch development data),
 * 2. creates that database if it does not exist,
 * 3. applies migrations,
 * 4. runs the suite one file at a time (they share the database).
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const url = new URL(testUrl);
const databaseName = url.pathname.slice(1);

if (databaseName === new URL(process.env.DATABASE_URL ?? 'postgres:///none').pathname.slice(1)) {
  console.error('TEST_DATABASE_URL must differ from DATABASE_URL — the suite wipes it.');
  process.exit(1);
}

// CREATE DATABASE cannot run inside the database being created, so connect to
// the default maintenance database first.
const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  console.log(`Created test database ${databaseName}`);
} catch (error) {
  if (!String(error).includes('already exists')) {
    console.error('Could not reach PostgreSQL. Is it running? Try: npm run db:up');
    console.error(error);
    process.exit(1);
  }
} finally {
  await admin.$disconnect();
}

const env = { ...process.env, DATABASE_URL: testUrl, NODE_ENV: 'test' };

execSync('npx prisma migrate deploy --schema prisma/schema.prisma', { env, stdio: 'inherit' });
execSync('node --import tsx --test --test-concurrency=1 server/tests/*.test.ts', {
  env,
  stdio: 'inherit',
  shell: '/bin/bash',
});
