/**
 * @file skill-fetch.ts
 * @description Minimal HTTP/HTTPS fetch helper for downloading SKILL.md files.
 *
 * Uses only Node built-in modules (`node:http`, `node:https`) — no external
 * dependencies. Follows up to 5 redirects. Caller is responsible for any
 * URL validation (scheme allowlist, domain allowlist); this helper takes
 * whatever URL it is handed and does not consult any allowlist of its own.
 *
 * The SSRF and scheme checks live in `server.ts` next to the other security
 * helpers so there is a single place to configure them.
 *
 * @module context-steward/core/skill-fetch
 */

import * as https from 'node:https';
import * as http from 'node:http';

/**
 * Fetches the text content of a URL using Node.js built-in `http`/`https` modules.
 * Follows up to 5 redirects automatically.
 *
 * @param url          - The URL to fetch.
 * @param redirectsLeft - Internal counter for redirect depth (default 5).
 * @returns A promise that resolves with the response body as a string.
 * @throws Error if the request fails, the status code indicates an error, or
 *         too many redirects occur.
 */
export function fetchUrl(url: string, redirectsLeft = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) {
      reject(new Error(`Too many redirects fetching: ${url}`));
      return;
    }

    const client = url.startsWith('https') ? https : http;

    client
      .get(url, (response) => {
        const statusCode = response.statusCode ?? 0;

        // Handle redirects
        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          fetchUrl(response.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
          response.resume();
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode} fetching: ${url}`));
          response.resume();
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}
