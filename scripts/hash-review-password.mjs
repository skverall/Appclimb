#!/usr/bin/env node
/**
 * Hash the app-reviewer password for the REVIEW_LOGIN_PASSWORD_HASH Worker
 * secret (src/lib/review-login.ts). Reads the password from stdin so it never
 * lands in shell history:
 *
 *   node scripts/hash-review-password.mjs < password.txt | npx wrangler secret put REVIEW_LOGIN_PASSWORD_HASH
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

// Workers' WebCrypto allows at most 100,000 PBKDF2 iterations.
const ITERATIONS = 100_000;

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/u, "");
if (password.length < 16) {
  console.error("Use a random password of at least 16 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
process.stdout.write(`pbkdf2-sha256$${ITERATIONS}$${salt.toString("base64url")}$${hash.toString("base64url")}`);
