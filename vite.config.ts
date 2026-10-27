import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

function netlifyFunctionsDev(): Plugin {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost:3000'}`);
        if (!url.pathname.startsWith('/api/')) return next();

        let handlerFile: string | null = null;
        if (url.pathname === '/api/webhooks/incoming') {
          handlerFile = '/netlify/functions/webhooks-incoming.ts';
        } else if (url.pathname === '/api/connectors/twitter') {
          handlerFile = '/netlify/functions/connectors-twitter.ts';
        } else if (url.pathname === '/api/connectors/zendesk') {
          handlerFile = '/netlify/functions/connectors-zendesk.ts';
        }

        if (!handlerFile) return next();

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const bodyBuffer = Buffer.concat(chunks);

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
            else headers.set(key, value);
          }

          const webRequest = new Request(url.href, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? '') ? undefined : bodyBuffer,
          });

          const mod = await server.ssrLoadModule(handlerFile);
          const handler = mod.default;
          const webResponse: Response = await handler(webRequest);

          res.statusCode = webResponse.status;
          webResponse.headers.forEach((val, key) => {
            res.setHeader(key, val);
          });
          const arrayBuffer = await webResponse.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (error) {
          console.error('[API dev proxy error]', error);
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: { code: 'DEV_SERVER_ERROR', message: String(error) } }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), netlifyFunctionsDev()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
