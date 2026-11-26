/**
 * YatraSathi — Better Auth Instance Factory for Cloudflare Workers + D1
 * Uses Better Auth's native Cloudflare D1 binding (`database: env.DB`).
 */

import { betterAuth } from 'better-auth';
import { sendTransactionalEmailDirect } from './email/dispatcher.mjs';

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

  const hasEmailSender = Boolean(
    (env.EMAIL && env.CF_EMAIL_FROM) ||
      (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.GMAIL_SENDER_ADDRESS)
  );

  const authConfig = {
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8
    },
    account: {
      accountLinking: {
        enabled: true,
        allowDifferentEmails: false,
        requireLocalEmailVerified: true
      }
    },
    onAPIError: {
      errorURL: '/index.html'
    },
    socialProviders,
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip']
      }
    }
  };

  if (hasEmailSender) {
    authConfig.emailVerification = {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendTransactionalEmailDirect({
          to: user.email,
          subject: 'YatraSathi — Verify Your Email Address',
          text: [
            `Hello ${user.name || 'Traveler'},`,
            '',
            'Verify your YatraSathi email address to secure your account and enable Google account linking:',
            url,
            '',
            'If you did not request this, you can safely ignore this email.'
          ].join('\n')
        }, env);
      }
    };
  }

  return betterAuth(authConfig);
}
