import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads `.env` from the repo root, if there is one, before anything reads a
 * credential.
 *
 * Four sources are credential-gated — `GITHUB_TOKEN`, `STACK_APP_KEY`,
 * `REDDIT_CLIENT_ID`/`SECRET`, `UDEMY_CLIENT_ID`/`SECRET` — and `.gitignore`
 * has always expected a `.env` (it ignores `.env*` but keeps `.env.example`).
 * Nothing actually read one, so keys put there were silently ignored and the
 * sources stayed skipped as if no key had been set at all.
 *
 * Resolved against this file rather than the working directory, so it loads
 * the same way from `npm run crawl`, `npm run serve` and the Vite plugin's
 * in-process crawl API. A missing file is normal and not an error: every
 * source that needs a key already reports itself as skipped.
 */
const ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');

try {
  process.loadEnvFile(ENV_FILE);
} catch {
  // No .env — the credential-gated sources report their own skip reason.
}
