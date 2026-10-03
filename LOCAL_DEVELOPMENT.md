# Local Docker development

The Compose stack runs Postgres with PostGIS, Redis, the NestJS API, and the
outbox/cron worker. API and worker are separate containers built from the same
multi-stage Dockerfile; the Flutter app remains a separately built APK.

1. Copy `.env.example` to `.env` and set `JWT_ACCESS_SECRET` to a fresh local
   random value. `.env` is ignored by Git. Do not put production credentials in
   this file or commit it.
2. Start everything with `docker compose up --build -d`.
3. Inspect startup with `docker compose ps` and `docker compose logs -f api worker`.
4. Stop containers with `docker compose down`. To also erase the local database,
   use `docker compose down -v` only when you intentionally want to discard it.

Compose applies pending migrations to its local Postgres database before the
API and worker start. Container-to-container connections use the service names
`postgres` and `redis`; host-run development uses `localhost` as shown in
`.env.example`.

For a staging APK, set the public staging API origin at build time; never embed
backend credentials in Flutter:

```bash
flutter build apk -t lib/main.dart --release \
  --dart-define=BASE_URL=https://medsuper-api-69168697113.europe-west1.run.app \
  --dart-define=ENV=staging
```
