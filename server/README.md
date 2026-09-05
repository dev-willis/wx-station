# wx-station server

Server-side retrieval and storage for wx-station. Two cron scripts poll
OpenWeatherMap and write to MariaDB; two read-only API endpoints serve that
stored data to the browser. The browser never talks to OpenWeatherMap for
weather data, and never sees the API key.

Data is scoped per row to a `location_id`, so any number of stations can be
tracked independently from the same database and the same cron jobs.

## Requirements

- PHP 7.4+ with the `pdo_mysql` extension
- MariaDB (or MySQL) reachable from the host running the cron jobs and the
  web server

## Setup

1. Configure credentials — see "Storing credentials securely" below for how
   and where. `config.local.php` already exists (gitignored, from
   `config.local.php.example`) with placeholder values; edit it directly for
   local development. The installer reads this to reach the database.

2. Run the installer:

   ```
   php server/install.php
   ```

   It applies `schema.sql` through the configured connection and installs
   the two crontab entries for the current user (inside a managed
   `# wx-station` block). Both steps are idempotent — re-run it any time.

   The database can be dedicated to wx-station or shared with another app
   (e.g. a MODX 3 install) — every table is prefixed `wx_` to avoid
   collisions. If the database named in the config doesn't exist yet, the
   installer creates it; if it does, the schema is applied into it as-is.
   The schema also seeds one `default` location using the station's original
   hardcoded coordinates.

   Useful flags: `--schema-only` / `--cron-only`, `--dry-run`,
   `--php-bin=PATH` (binary used in the crontab lines, defaults to the
   running interpreter), `--log-dir=PATH` (default `/var/log`),
   `--current-schedule=EXPR` / `--forecast-schedule=EXPR`. `--help` lists
   them all.

   Doing it by hand instead:

   ```
   mysql -u root -p wx_station < server/schema.sql
   ```
   ```cron
   */10 * * * * php /path/to/server/cron/fetch_current.php  >> /var/log/wx_current.log 2>&1
   0    * * * * php /path/to/server/cron/fetch_forecast.php >> /var/log/wx_forecast.log 2>&1
   ```

3. Prime the tables by running both cron scripts once, so `wx_current` has
   an initial row before the browser's first request:

   ```
   php server/cron/fetch_current.php
   php server/cron/fetch_forecast.php
   ```

4. Deploy the files — see "File layout on the server" below. `main.js`
   calls `/server/api/weather.php?location=<slug>`, so `api/` must be
   reachable at that URL path; adjust `main.js` if you serve it elsewhere.

## File layout on the server

Only `api/` is ever requested over HTTP. `config.php`, `config.local.php`,
`db.php`, `lib/`, `cron/`, `schema.sql`, and `install.php` are only
`require`d by PHP or run from the CLI — so they belong **outside the web
root**, where a server misconfiguration (`.php` served as text, directory
listing) has nothing sensitive to expose.

```
/var/www/wx-station-app/        ← outside the web root, not served
├── config.php  config.local.php  db.php
├── lib/  cron/  schema.sql  install.php

<web root>/
├── index.html  src/  …         ← the static frontend
└── server/
    └── api/                    ← the only PHP the web server sees
        ├── bootstrap.php  weather.php  locations.php
```

`api/bootstrap.php` locates the app directory in this order:

1. `$_SERVER['WX_APP_DIR']` — set by the web server:

   ```apache
   # Apache (mod_php or mod_proxy_fcgi)
   SetEnv WX_APP_DIR /var/www/wx-station-app
   ```
   ```nginx
   # nginx: in the location that runs PHP
   fastcgi_param WX_APP_DIR /var/www/wx-station-app;
   ```

2. `getenv('WX_APP_DIR')` — set in the PHP-FPM **pool** config (an
   Apache/nginx `SetEnv`/`fastcgi_param` does *not* reach `getenv()`, only
   `$_SERVER`; the pool `env[]` reaches both):

   ```ini
   ; /etc/php/8.x/fpm/pool.d/wx-station.conf
   env[WX_APP_DIR] = /var/www/wx-station-app
   ```
   Reload PHP-FPM after editing (`systemctl reload php8.x-fpm`).

3. `api/app_dir.php` — a gitignored file that just `return`s the path, for
   shared hosts where you can't set env vars at all. Copy
   `api/app_dir.php.example` to `api/app_dir.php` and edit the path.

4. Otherwise `api/`'s parent directory — the intact-checkout layout used
   for local dev and CI. Keep it split in production.

On a 500 with `{"error":"Server misconfigured..."}` the response's `tried`
field and the PHP error log show which path it resolved to.

The cron scripts and `install.php` run from the app directory with their
own relative `require`s, so they need no environment variable.

## Storing credentials securely

`config.php` resolves DB and API-key settings in this order: environment
variables (`WX_DB_HOST`, `WX_DB_PORT`, `WX_DB_NAME`, `WX_DB_USER`,
`WX_DB_PASS`, `WX_OWM_API_KEY`) first, then a PHP file that returns an
array in the same shape as `config.local.php.example`, overriding whatever
env vars set. That file's path is `$WX_CONFIG_FILE` if set, otherwise
`config.local.php` next to `config.php`.

With the layout above, `config.local.php` already sits outside the web
root, which is enough for most deployments — lock it down with `chmod 600`
owned by the web server user. Tighten further if you want:

1. **Environment variables set by the process manager** (systemd
   `EnvironmentFile=`, the PHP-FPM pool config, a container's env) — no
   credentials on disk at all. Set them alongside `WX_APP_DIR`.
2. **A credentials file pointed to by `WX_CONFIG_FILE`** — useful to keep
   the secret out of the app directory too (e.g. under `/etc`), or to
   share one file across environments.
3. **`config.local.php` in the app directory** — the default; fine as long
   as the app directory is genuinely outside the web root.

## Adding a location

```sql
INSERT INTO wx_locations (slug, name, lat, lon) VALUES ('austin', 'Austin, TX', 30.267153, -97.743057);
```

The next cron run picks it up automatically. Load the frontend with
`?loc=austin` to view it.

## Endpoints

- `GET api/weather.php?location=<slug>` — current conditions, hourly/daily
  forecast, and up to 48 hours of observation history for one location.
  404 if the location doesn't exist, 503 if no data has been fetched yet.
- `GET api/locations.php` — list of active locations (`slug`, `name`,
  `lat`, `lon`).
