# Backend container deployment

The backend runs as two processes from the same image: the HTTP API and the
background worker. Run one API service and at least one worker service. Both
need the same production `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, and
`JWT_ACCESS_SECRET`; provide other integration secrets only for capabilities
enabled in the launch scope. Configure values in the hosting platform's secret
manager, never in the image or repository.

## Build and run

Build from the `clinic-reservations/` directory:

```sh
docker build -t medsuper-api:release .
```

Run the API with the default command:

```sh
docker run --env-file <protected-runtime-env-file> -p 3000:3000 medsuper-api:release
```

Run a separate worker from the same image:

```sh
docker run --env-file <protected-runtime-env-file> medsuper-api:release node dist/worker.js
```

Set `CORS_ALLOWED_ORIGINS` to the exact HTTPS origins of the staff dashboards.
The public health endpoints are `/v1/health/live` for liveness and
`/v1/health/ready` for readiness; the latter checks PostgreSQL and Redis.

## Database migrations

Apply committed migrations once as a controlled pre-deploy job, before starting
new application instances. Do not run migrations independently from every API
or worker replica. Use a CI runner with the repository and production
`DATABASE_URL` / `DIRECT_URL` secrets:

```sh
npm ci
npm run db:generate
npm run db:migrate:deploy
```

Do not run `db:migrate`, demo seeds, or local slot-generation scripts against
production as part of deployment.

## Production environment checklist

- Use managed PostgreSQL with TLS and a separately restricted direct migration
  URL, plus managed Redis with authentication and TLS.
- Set `NODE_ENV=production`, `PORT`, `REDIS_ENABLED=true`, an explicit CORS
  allowlist containing only HTTPS origins (no paths), and a unique
  `JWT_ACCESS_SECRET` of at least 32 characters. Startup validates these
  constraints and refuses to reflect arbitrary browser origins.
- Configure ImageKit and whichever payment and push providers are in the
  agreed launch scope. OTP currently uses `LoggingOtpSender`, which prints
  codes instead of delivering SMS; backend production startup now fails until
  a real OTP provider is selected and wired. Do not bypass this check.
- Payment and push integrations can still be unset, but related actions fail
  at runtime until their providers are configured. Only expose capabilities
  whose credentials and live provider flows have been verified.
- Keep API and worker logs, health probes, restart policy, backups, and alerts
  enabled in the chosen hosting platform. Verify restore procedures before
  accepting real patient data.
