/**
 * YatraSathi — Better Auth Instance Factory for Cloudflare Workers + D1
 * Uses Better Auth's native Cloudflare D1 binding (`database: env.DB`).
 */

import { betterAuth } from 'better-auth';

export function createAuth(env, requestOrigin) {
  const isLocalRequest = Boolean(
    requestOrigin &&
      (requestOrigin.startsWith('http://127.0.0.1:') || requestOrigin.startsWith('http://localhost:'))
  );
  const baseURL = isLocalRequest
    ? requestOrigin
    : (env.APP_BASE_URL || requestOrigin || 'http://127.0.0.1:8787');
  const trustedOrigins = [baseURL];
  const isLocalDev = isLocalRequest || baseURL.includes('127.0.0.1:') || baseURL.includes('localhost:');
  if (isLocalDev) {
    trustedOrigins.push(
      'http://127.0.0.1:8787',
      'http://localhost:8787',
      'http://127.0.0.1:5500',
      'http://localhost:5500'
    );
  }

  const socialProviders = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET
    };
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
    socialProviders,
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip']
      }
    }
  });
}
