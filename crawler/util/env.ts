/**
 * Loads `.env` into `process.env` before any crawler reads a credential.
 *
 * Every entry point — the CLI, the standalone server and the Vite plugin —
 * imports `crawler/config.ts`, so importing this there covers all three without
 * each one having to remember a `--env-file` flag.
 *
 * A value already in the environment wins: an exported `GITHUB_TOKEN` or a CI
 * secret is not overwritten by a stale line in someone's local file.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');

if (existsSync(ENV_FILE)) {
  const preset = new Map(Object.entries(process.env));
  try {
    process.loadEnvFile(ENV_FILE);
    for (const [key, value] of preset) {
      if (value !== undefined) process.env[key] = value;
    }
  } catch (error) {
    console.warn(`Could not read .env (${(error as Error).message}) — continuing without it.`);
  }
}
