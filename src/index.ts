import Fastify from 'fastify';


const app = Fastify({ logger: true });

// Bootstrap-only health check — module routes are registered per-module under src/modules/*/api, not here yet.
app.get('/health', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT) || 3000;

app
  .listen({ port, host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
