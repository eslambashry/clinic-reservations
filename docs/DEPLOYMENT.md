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

Apply committed migrations once as a controlled pre-deploy job, before updating
the worker or API. Do not run migrations independently from every API or
worker replica. The staging `cloudbuild.yaml` builds the Dockerfile's
`migrator` target, updates the `medsuper-db-migrate` Cloud Run Job image, executes
that job once, and waits for success. A failed job stops the build before either
application service is updated. The job runs `prisma migrate deploy`; it does
not seed data.

Configure the Cloud Run Job separately in GCP. Bind both `DIRECT_URL` and
`DATABASE_URL` to the connection secret for the role that owns
`_prisma_migrations` and the application tables. In staging this is the
`medsuper-database-url` secret for `medsuper_app`; the separate `postgres`
connection cannot read `_prisma_migrations`. Give the job's runtime service
account access to that secret and network connectivity to the database. Keep
the secret value and Secret Manager binding out of
`cloudbuild.yaml`; the build only changes the job image and executes it. Grant
the Cloud Build service account Artifact Registry push access and permission to
update and execute the Cloud Run Job, plus any required `iam.serviceAccounts.actAs`
permission for the job runtime identity. The job must exist in `europe-west1`
as `medsuper-db-migrate` before running this build.

For other CI environments, provide the migration URL through the platform's
secret manager; never commit it or pass it as a build argument:

```sh
npm ci
npm run db:generate
npm run db:migrate:deploy
```

Do not run `db:migrate`, demo seeds, or local slot-generation scripts against
production as part of deployment.

## GCP staging verification — 2026-10-01

The GCP project `project-399dfad9-c3f6-4a3d-a7f` had no Cloud Build trigger
configured when checked. A push to `staging` does not automatically deploy this
backend. The `cloudbuild.yaml` file is a manual build/deploy recipe.

For this staging update, an on-demand Cloud SQL backup completed successfully
before Prisma migration `20261001090000_rekey_legacy_demo_uuids` was applied.
Prisma reported all 44 migrations applied. Direct SQL checks found zero legacy
branch UUIDs and 9 pharmacy plus 7 lab branches with corrected UUIDv4-format
IDs. Cloud Build `a1e91466-0350-44df-9ff3-50d00514f2a2` built image
`staging-be9c859`; Cloud Run worker revision `medsuper-worker-00004-fx2` and
API revision `medsuper-api-00007-wz4` use it, with the API receiving 100% of
traffic. `/v1/health/ready` reported database and Redis ready; public branch
searches returned corrected IDs. This does not establish a live authenticated
provider upload/approval or staff queue flow on deployed staging.

## GCP staging update — 2026-10-02

An on-demand backup of `medsuper-staging-db` completed before this update.
Cloud Build `4530b59e-535d-49ee-8ec8-4c387acef596` built and pushed the
backend and migrator images tagged `a84ec66`, then stopped at the job update:
its build identity `69168697113-compute@developer.gserviceaccount.com` lacks
`run.jobs.get` on `medsuper-db-migrate`. Neither service was updated by that
build. Grant this identity the narrowly scoped Cloud Run Job read/update/run
permissions needed by `cloudbuild.yaml` before relying on automatic migration
and deployment. A Cloud Build trigger is also still unconfigured.

The signed-in operator updated the job image and ran the migration separately.
Two executions failed on `_prisma_migrations` permissions before applying any
new migration. Direct SQL showed that `medsuper_app` owns that table and the
application tables. The job's `DIRECT_URL` and `DATABASE_URL` now both refer to
the existing `medsuper-database-url` Secret Manager secret. Execution
`medsuper-db-migrate-9hg9b` completed, and database history confirms migrations
`20261001090300`, `20261001090400`, and `20261001090500` finished. The migration
job retains only the two Prisma connection variables; its unused legacy
`ADMIN_DATABASE_URL` and `APP_DATABASE_URL` bindings were removed. The worker
was then updated to revision `medsuper-worker-00005-qpn` (Ready), followed by
API revision `medsuper-api-00008-vq7` (100% traffic); both use image `a84ec66`.
`/v1/health/ready` reported database and Redis ready. Authenticated clinical
and staff flows were not exercised in this deployment check.

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
