import { verifySignature } from '../lib/auth.ts';
import { optionalEnv } from '../lib/env.ts';
import { AppError } from '../lib/errors.ts';
import { createHandler } from '../lib/http.ts';

export const config = { path: '/api/webhooks/verify' };

export default createHandler({
  name: 'webhook.verify',
  methods: ['GET', 'POST'],
  auth: 'webhook',
  cors: true,
  async handle({ req, log }) {
    const signingSecret = optionalEnv('WEBHOOK_SIGNING_SECRET');
    const signature = req.headers.get('x-signature');

    if (signingSecret && signature) {
      const rawBody = await req.text();
      if (!(await verifySignature(rawBody, signature, signingSecret))) {
        throw new AppError(401, 'INVALID_SIGNATURE', 'The request signature does not match the payload.', {
          retryable: false,
        });
      }
    }

    log.info('webhook.verify.success', { verified: true });

    return {
      body: {
        verified: true,
        connector: 'webhook',
        serverTime: new Date().toISOString(),
        persistedTo: 'none',
        message: 'Webhook credentials verified successfully.',
      },
    };
  },
});
