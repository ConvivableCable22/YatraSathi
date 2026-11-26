/**
 * YatraSathi — Better Auth Instance Factory for Cloudflare Workers + D1
 * Uses Better Auth's native Cloudflare D1 binding (`database: env.DB`).
 */

import { betterAuth } from 'better-auth';

export function createAuth(env, requestOrigin) {
  const baseURL = env.APP_BASE_URL || requestOrigin || 'http://127.0.0.1:8787';
  const trustedOrigins = [baseURL];
  const isLocalDev = baseURL.includes('127.0.0.1:8787') || baseURL.includes('localhost:8787');
  if (isLocalDev) {
    trustedOrigins.push(
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'http://127.0.0.1:5500',
      'http://localhost:5500'
    );
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip']
      }
    }
  });
}
