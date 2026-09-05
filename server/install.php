<?php
/**
 * wx-station installer.
 *
 * Two steps, both idempotent — safe to re-run:
 *   1. schema  — creates the wx_ tables (and the database itself if missing)
 *                by applying schema.sql through the configured connection.
 *   2. cron    — installs the fetch_current / fetch_forecast crontab entries
 *                for the current user, inside a managed "# wx-station" block.
 *
 * Usage:
 *   php server/install.php [options]
 *
 * Options:
 *   --schema-only            Run the schema step, skip cron.
 *   --cron-only              Run the cron step, skip schema.
 *   --no-cron                Alias for --schema-only.
 *   --php-bin=PATH           PHP binary to use in the crontab lines
 *                            (default: this interpreter, PHP_BINARY).
 *   --log-dir=PATH           Directory for the cron log files
 *                            (default: /var/log).
 *   --current-schedule=EXPR  Cron expression for fetch_current
 *                            (default: every 10 minutes).
 *   --forecast-schedule=EXPR Cron expression for fetch_forecast
 *                            (default: top of every hour).
 *   --dry-run                Print what would happen, change nothing.
 *   -h, --help               Show this help.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("CLI only.\n");
}

$server_dir = __DIR__;

$opts = parse_args(array_slice($argv, 1));

if (isset($opts['help']) || isset($opts['h'])) {
    fwrite(STDOUT, extract_doc_comment(__FILE__));
    exit(0);
}

$dry_run    = isset($opts['dry-run']);
$do_schema  = !isset($opts['cron-only']);
$do_cron    = !isset($opts['no-cron']) && !isset($opts['schema-only']);

$php_bin    = $opts['php-bin']    ?? (PHP_BINARY ?: 'php');
$log_dir    = rtrim($opts['log-dir'] ?? '/var/log', '/');
$current_schedule  = $opts['current-schedule']  ?? '*/10 * * * *';
$forecast_schedule = $opts['forecast-schedule'] ?? '0 * * * *';

info($dry_run ? 'Running in --dry-run mode; nothing will be changed.' : 'Starting wx-station install.');

if ($do_schema) {
    install_schema($server_dir, $dry_run);
}

if ($do_cron) {
    install_cron(
        $server_dir,
        $php_bin,
        $log_dir,
        $current_schedule,
        $forecast_schedule,
        $dry_run
    );
}

print_next_steps($server_dir, $do_schema, $do_cron);

exit(0);

// ── Schema ───────────────────────────────────────────────────────────────────

function install_schema(string $server_dir, bool $dry_run): void
{
    section('Schema');

    $config = require $server_dir . '/config.php';
    $db = $config['db'];

    $schema_file = $server_dir . '/schema.sql';
    if (!is_file($schema_file)) {
        fail("schema.sql not found at {$schema_file}");
    }

    $dsn_no_db = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $db['host'], $db['port']);
    $pdo_options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn_no_db, $db['user'], $db['pass'], $pdo_options);
    } catch (PDOException $e) {
        fail("Could not connect to MySQL at {$db['host']}:{$db['port']} as '{$db['user']}': " . $e->getMessage());
    }

    $quoted_db = '`' . str_replace('`', '``', $db['name']) . '`';
    $exists = (bool) $pdo->query(
        "SELECT 1 FROM information_schema.schemata WHERE schema_name = " . $pdo->quote($db['name'])
    )->fetchColumn();

    if ($exists) {
        info("Database '{$db['name']}' already exists — applying schema into it (shared-DB safe, wx_ prefix).");
    } elseif ($dry_run) {
        info("Would create database '{$db['name']}'.");
    } else {
        $pdo->exec("CREATE DATABASE {$quoted_db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        info("Created database '{$db['name']}'.");
    }

    $pdo->exec("USE {$quoted_db}");

    $statements = split_sql_statements(file_get_contents($schema_file));
    info(count($statements) . ' schema statement(s) to apply.');

    foreach ($statements as $sql) {
        $label = first_line($sql);
        if ($dry_run) {
            info("  would run: {$label}");
            continue;
        }
        try {
            $pdo->exec($sql);
            info("  ok: {$label}");
        } catch (PDOException $e) {
            fail("Failed on statement [{$label}]: " . $e->getMessage());
        }
    }

    if (!$dry_run) {
        $tables = $pdo->query(
            "SELECT table_name FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name LIKE 'wx\\_%'
             ORDER BY table_name"
        )->fetchAll(PDO::FETCH_COLUMN);
        info('wx_ tables present: ' . ($tables ? implode(', ', $tables) : '(none?)'));
    }
}

/**
 * schema.sql only contains plain DDL plus one INSERT — no routines, no
 * semicolons inside string literals — so stripping comment lines and
 * splitting on ";" is sufficient.
 */
function split_sql_statements(string $sql): array
{
    $lines = preg_split('/\r?\n/', $sql);
    $clean = [];
    foreach ($lines as $line) {
        if (preg_match('/^\s*--/', $line)) {
            continue;
        }
        $clean[] = $line;
    }

    $joined = implode("\n", $clean);
    $parts = array_map('trim', explode(';', $joined));

    return array_values(array_filter($parts, static fn($s) => $s !== ''));
}

// ── Cron ─────────────────────────────────────────────────────────────────────

function install_cron(
    string $server_dir,
    string $php_bin,
    string $log_dir,
    string $current_schedule,
    string $forecast_schedule,
    bool $dry_run
): void {
    section('Cron');

    if (!command_exists('crontab')) {
        fail("'crontab' not found in PATH — install cron or run with --schema-only and add the jobs manually (see server/README.md).");
    }

    $php_bin = resolve_php_bin($php_bin);

    if (!is_dir($log_dir) || !is_writable($log_dir)) {
        info("Warning: log dir '{$log_dir}' is missing or not writable by "
            . (get_current_user() ?: 'this user') . '; cron output may be lost. Override with --log-dir=PATH.');
    }

    $current_script  = $server_dir . '/cron/fetch_current.php';
    $forecast_script = $server_dir . '/cron/fetch_forecast.php';

    $block_lines = [
        '# BEGIN wx-station (managed by server/install.php — edits here are overwritten on re-run)',
        sprintf('%s %s %s >> %s/wx_current.log 2>&1',  $current_schedule,  escape_cron_arg($php_bin), escape_cron_arg($current_script),  $log_dir),
        sprintf('%s %s %s >> %s/wx_forecast.log 2>&1', $forecast_schedule, escape_cron_arg($php_bin), escape_cron_arg($forecast_script), $log_dir),
        '# END wx-station',
    ];
    $block = implode("\n", $block_lines);

    $existing = read_current_crontab();
    $without_block = strip_managed_block($existing);
    $had_block = trim($without_block) !== trim($existing);

    $new_crontab = rtrim($without_block, "\n");
    $new_crontab = ($new_crontab === '' ? '' : $new_crontab . "\n") . $block . "\n";

    info(($had_block ? 'Replacing' : 'Adding') . ' the wx-station crontab block:');
    foreach ($block_lines as $l) {
        info('  ' . $l);
    }

    if ($dry_run) {
        info('Would write the above to the current user\'s crontab.');
        return;
    }

    write_crontab($new_crontab);
    info('Crontab updated for user ' . (get_current_user() ?: '(unknown)') . '.');
}

function read_current_crontab(): string
{
    $out = [];
    $code = 0;
    exec('crontab -l 2>/dev/null', $out, $code);

    // Exit code 1 with no output simply means "no crontab yet".
    return $code === 0 ? implode("\n", $out) . "\n" : '';
}

function strip_managed_block(string $crontab): string
{
    return preg_replace(
        '/^\s*# BEGIN wx-station\b.*?^\s*# END wx-station\b[^\n]*\n?/ms',
        '',
        $crontab
    ) ?? $crontab;
}

function write_crontab(string $crontab): void
{
    $tmp = tempnam(sys_get_temp_dir(), 'wxcron');
    if ($tmp === false) {
        fail('Could not create a temp file for the new crontab.');
    }
    file_put_contents($tmp, $crontab);

    $out = [];
    $code = 0;
    exec('crontab ' . escapeshellarg($tmp) . ' 2>&1', $out, $code);
    unlink($tmp);

    if ($code !== 0) {
        fail("'crontab' rejected the new file: " . implode("\n", $out));
    }
}

function resolve_php_bin(string $php_bin): string
{
    if (strpos($php_bin, '/') !== false) {
        if (!is_file($php_bin) || !is_executable($php_bin)) {
            fail("--php-bin '{$php_bin}' is not an executable file.");
        }
        return $php_bin;
    }

    $out = [];
    $code = 0;
    exec('command -v ' . escapeshellarg($php_bin) . ' 2>/dev/null', $out, $code);
    if ($code !== 0 || empty($out[0])) {
        fail("Could not resolve PHP binary '{$php_bin}' from PATH; pass --php-bin=/full/path/to/php.");
    }
    return $out[0];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parse_args(array $args): array
{
    $opts = [];
    foreach ($args as $arg) {
        if (preg_match('/^--([a-z0-9-]+)=(.*)$/i', $arg, $m)) {
            $opts[$m[1]] = $m[2];
        } elseif (preg_match('/^--([a-z0-9-]+)$/i', $arg, $m)) {
            $opts[$m[1]] = true;
        } elseif ($arg === '-h') {
            $opts['h'] = true;
        } else {
            fail("Unknown argument: {$arg} (try --help)");
        }
    }
    return $opts;
}

function command_exists(string $cmd): bool
{
    $out = [];
    $code = 0;
    exec('command -v ' . escapeshellarg($cmd) . ' 2>/dev/null', $out, $code);
    return $code === 0;
}

function escape_cron_arg(string $path): string
{
    // crontab has no quoting rules of its own; a shell runs the line, so
    // only paths with shell metacharacters need quoting.
    return preg_match('/[^A-Za-z0-9_\/.\-]/', $path) ? escapeshellarg($path) : $path;
}

function first_line(string $s): string
{
    $line = strtok(trim($s), "\n");
    $line = trim(preg_replace('/\s+/', ' ', $line));
    return strlen($line) > 72 ? substr($line, 0, 69) . '...' : $line;
}

function extract_doc_comment(string $file): string
{
    $src = file_get_contents($file);
    if (preg_match('#/\*\*(.*?)\*/#s', $src, $m)) {
        $body = preg_replace('/^\s*\* ?/m', '', trim($m[1]));
        return $body . "\n";
    }
    return "See the top of server/install.php for usage.\n";
}

function section(string $title): void
{
    fwrite(STDOUT, "\n== {$title} ==\n");
}

function info(string $msg): void
{
    fwrite(STDOUT, $msg . "\n");
}

function fail(string $msg): void
{
    fwrite(STDERR, "\nERROR: {$msg}\n");
    exit(1);
}

function print_next_steps(string $server_dir, bool $did_schema, bool $did_cron): void
{
    section('Next steps');

    $config_local = $server_dir . '/config.local.php';
    if (!is_file($config_local)) {
        info("- Create credentials: copy config.local.php.example to config.local.php and set the DB");
        info("  password + owm_api_key (or use environment variables — see server/README.md).");
    } else {
        info("- Confirm config.local.php has a real DB password and owm_api_key.");
    }

    if ($did_schema) {
        info("- The 'default' location (Nashville, TN) was seeded. Add more with:");
        info("    INSERT INTO wx_locations (slug, name, lat, lon) VALUES ('austin', 'Austin, TX', 30.267153, -97.743057);");
    }

    if ($did_cron) {
        info("- Prime the tables now so the browser has data before the first cron tick:");
        info("    php " . $server_dir . "/cron/fetch_current.php");
        info("    php " . $server_dir . "/cron/fetch_forecast.php");
    }

    info("- Point the web server at server/api/ and confirm api/weather.php?location=default returns JSON.");
}
