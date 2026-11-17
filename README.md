# LabTrack 1.0

LabTrack is a Chinese-language web app for a research group's equipment register, loans, returns, and direct member-to-member handovers. The server is Next.js, TypeScript, Prisma, and PostgreSQL. The database is the source of truth for all business state; browsers never receive database credentials.

## Requirements

- Node.js 22 or newer and npm 11 for development.
- PostgreSQL 16 or newer, or Docker Engine with Compose.
- A random `NEXTAUTH_SECRET` of at least 32 bytes.

## Quick start with Docker Compose

1. Copy `.env.example` to `.env`. Change `POSTGRES_PASSWORD` and `NEXTAUTH_SECRET` to strong, unique values. Use a URL-safe password for the Compose example because it is interpolated into a database URL. Keep `.env` private.
2. Run `docker compose up --build -d`. The web container applies the checked-in Prisma migration before starting.
3. Create the first administrator. Set `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` (12+ characters) in the shell, then run `docker compose run --rm -e SEED_ADMIN_USERNAME -e SEED_ADMIN_PASSWORD web npm run db:seed` on Unix. On PowerShell, set the same variables with `$env:...` first; Compose forwards them with the same `-e` flags. Remove the seed variables afterward.
4. Visit `http://localhost:3000` and sign in. The administrator can create other accounts from **用户管理**.

For example data in a disposable development database, set `SEED_DEMO=true` and `SEED_DEMO_PASSWORD` (12+ characters) before running the seed command. The example creates one member and one equipment item. Never enable demo data in production.

The Compose PostgreSQL volume and upload volume persist when containers restart. Do not use `docker compose down -v` unless you intend to delete both volumes.

## Local development without the web container

1. Run PostgreSQL 16+ locally, or start only the Compose database with `docker compose up -d db`.
2. Copy `.env.example` to `.env`, set a real local `DATABASE_URL`, `NEXTAUTH_URL=http://localhost:3000`, and `NEXTAUTH_SECRET`.
3. Run `npm ci`, `npm run db:generate`, `npm run db:migrate` (or `npm run db:dev` while changing the schema), then `npm run db:seed` with bootstrap credentials set.
4. Run `npm run dev`. Uploaded images persist under `UPLOAD_DIR` (default `./storage`).

All timestamps are stored in UTC. The UI formats dates in `APP_TIME_ZONE` (default `Asia/Shanghai`). `datetime-local` form values are interpreted with `APP_TIME_ZONE_OFFSET` (default `+08:00`); set both values consistently if deploying for a different fixed-offset timezone. Daylight-saving time zones need a future date-input conversion enhancement.

## Workflow and access

- Members can browse assets, request a loan, return their current loan, and initiate/answer a handover. Their private loan list contains only their own records.
- Managers additionally edit assets, inspect all loans and handovers, approve restricted loans and handovers, confirm returns, resolve disputes, and export CSV records.
- Administrators additionally create/deactivate accounts, change roles and system limits, and view audit logs. There is no public registration.
- An ordinary checkout creates an active loan immediately. Restricted equipment creates a request; manager approval does not reserve the device. A manager must confirm actual pickup, and the service checks availability again.
- A return request marks the existing loan `RETURN_PENDING`. Manager inspection closes it, records the actual return and the device condition, and preserves history.
- A handover records a source loan and recipient. The recipient agrees, a manager approves when required, the sender confirms release, and the recipient confirms receipt. The original loan stays active and responsible until receipt. Receipt closes the original loan and creates the new one in a single transaction. A dispute requires a manager to record the verified physical outcome and reason.

The service locks the equipment row before each critical write. PostgreSQL partial unique indexes additionally prevent two active loans or overlapping open handovers. All changes to the responsibility chain create equipment events and audit entries. Expiry never reverses a `RELEASED` handover.

## Configuration

See `.env.example`. For S3-compatible object storage, set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` together. Otherwise images use the persistent `UPLOAD_DIR`. Only JPEG, PNG, and WebP uploads under `MAX_UPLOAD_MB` are accepted. Private image reads require an active account.

The default maximum loan period is 90 days and pre-release handover expiry is 168 hours. An administrator can change both in **系统设置**. Schedule `npm run job:expire` (for example, hourly with cron or a systemd timer) to expire stale handovers before release. This job never expires a released or disputed handover.

## Production deployment

Provide a dedicated PostgreSQL database, a fixed HTTPS domain, `NEXTAUTH_URL=https://your-domain`, a long random `NEXTAUTH_SECRET`, and durable image storage. Run the Docker image behind an HTTPS reverse proxy (Caddy, Nginx, or equivalent) and restrict database access to the app host. You can use the image with an external PostgreSQL service by supplying `DATABASE_URL` and the other environment variables; no cloud-vendor API is required. Apply `npm run db:migrate` before serving traffic; the included Docker command performs this step on startup. Configure the reverse proxy to forward the original host/protocol and only accept trusted traffic.

Rotate bootstrap passwords after setup. Keep the database and upload storage private. Back up both. The app uses signed JWT session cookies and checks the current account status in PostgreSQL on every protected request.

## Backup and restore

For the included Compose database, create a PostgreSQL custom-format dump inside the container and copy it to a protected backup directory:

```text
docker compose exec db pg_dump -U labtrack -d labtrack -Fc -f /tmp/labtrack.dump
docker compose cp db:/tmp/labtrack.dump ./labtrack.dump
```

To restore into a **separate empty test database**, copy the dump into the database container and restore it, then verify table counts and a sample equipment history:

```text
docker compose exec db createdb -U labtrack labtrack_restore_test
docker compose cp ./labtrack.dump db:/tmp/labtrack.dump
docker compose exec db pg_restore -U labtrack -d labtrack_restore_test --no-owner /tmp/labtrack.dump
docker compose exec db psql -U labtrack -d labtrack_restore_test -c "SELECT count(*) FROM equipment;"
```

Schedule backups externally (daily is a practical default), retain off-host encrypted copies, and practice restore periodically. Also back up the `upload_data` volume, unless S3-compatible storage is used; database dumps contain file metadata but not image bytes. Restoration into the live database requires a maintenance window and a separately reviewed procedure.

## Tests

- `npm run typecheck` validates TypeScript.
- `npm test` runs pure availability tests.
- `npm run test:db` starts disposable embedded PostgreSQL, applies migrations, runs the integration suite, and cleans up. This works without Docker on supported desktop platforms.
- `npm run test:backup` repeats the database suite, then verifies a `pg_dump`/`pg_restore` round trip in a separate database.
- `TEST_DATABASE_URL=postgresql://.../labtrack_test npm run test:integration` runs real database tests. The database name **must end in `_test`** because the suite clears its tables before each test. Apply migrations there first with `DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate`.
- `npm run test:e2e:local` starts disposable embedded PostgreSQL and a local Next.js server, seeds test-only users, and runs the Chrome browser flow. A system Chrome installation is needed. `npm run test:e2e` targets an already running test instance configured with `E2E_BASE_URL` and `E2E_PASSWORD`.
- `npm run build` checks the production build.

Database integration cases cover simultaneous checkout, handover responsibility transfer, repeat receipt, restricted approval, return/handover conflict, disputes, and authorization. The UI can be smoke-tested in a browser using the seeded users after a local database is running.

## Known limitations

- This project does not send email or SMS invitations. Administrators create accounts and share initial credentials by their existing secure channel.
- Handover expiry requires the scheduled job above; there is no built-in task scheduler.
- A fixed `APP_TIME_ZONE_OFFSET` does not handle daylight-saving transitions in other time zones. Check `TEST_RESULTS.md` for the verified scope of this delivery.
