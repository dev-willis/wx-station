<?php
/**
 * Fetches current conditions (OWM /data/2.5/weather) for every active
 * location and upserts wx_current, appending one wx_log entry per hour.
 *
 * Cron: every 10 minutes
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('CLI only.');
}

require __DIR__ . '/../db.php';
require __DIR__ . '/../lib/locations.php';

$config = require __DIR__ . '/../config.php';
$api_key = $config['owm_api_key'];

if (empty($api_key)) {
    fwrite(STDERR, "FATAL: owm_api_key is not configured.\n");
    exit(1);
}

$pdo = wx_db();
$locations = wx_active_locations($pdo);
$now = time();
$exit_code = 0;

foreach ($locations as $location) {
    try {
        fetch_current_for_location($pdo, $location, $api_key, $now);
        log_msg("OK: {$location['slug']}");
    } catch (Throwable $e) {
        $exit_code = 1;
        log_msg("ERROR ({$location['slug']}): " . $e->getMessage());
    }
}

exit($exit_code);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetch_current_for_location(PDO $pdo, array $location, string $api_key, int $now): void
{
    $url = sprintf(
        'https://api.openweathermap.org/data/2.5/weather?units=imperial&lat=%F&lon=%F&appid=%s',
        $location['lat'],
        $location['lon'],
        $api_key
    );

    $raw = @file_get_contents($url);
    if ($raw === false) {
        throw new RuntimeException('HTTP request failed.');
    }

    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($data['main'])) {
        throw new RuntimeException('Invalid JSON response: ' . substr($raw, 0, 200));
    }

    $location_id = (int) $location['id'];

    $pdo->beginTransaction();
    try {
        write_current($pdo, $location_id, $data);
        write_log($pdo, $location_id, $data, $now);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * /2.5/weather doesn't return dew_point or uvi — those columns are left
 * untouched here and filled in hourly by fetch_forecast.php instead.
 */
function write_current(PDO $pdo, int $location_id, array $d): void
{
    $m = $d['main'] ?? [];
    $w = $d['weather'][0] ?? [];
    $s = $d['sys'] ?? [];
    $wind = $d['wind'] ?? [];

    $stmt = $pdo->prepare('
        INSERT INTO wx_current (
            location_id, fetched_at, temp, feels_like, humidity, pressure,
            wind_speed, wind_deg, sunrise, sunset, weather_id, weather_main, weather_desc, weather_icon
        ) VALUES (
            :location_id, :fetched_at, :temp, :feels_like, :humidity, :pressure,
            :wind_speed, :wind_deg, :sunrise, :sunset, :weather_id, :weather_main, :weather_desc, :weather_icon
        )
        ON DUPLICATE KEY UPDATE
            fetched_at = VALUES(fetched_at),
            temp = VALUES(temp),
            feels_like = VALUES(feels_like),
            humidity = VALUES(humidity),
            pressure = VALUES(pressure),
            wind_speed = VALUES(wind_speed),
            wind_deg = VALUES(wind_deg),
            sunrise = VALUES(sunrise),
            sunset = VALUES(sunset),
            weather_id = VALUES(weather_id),
            weather_main = VALUES(weather_main),
            weather_desc = VALUES(weather_desc),
            weather_icon = VALUES(weather_icon)
    ');

    $stmt->execute([
        'location_id'  => $location_id,
        'fetched_at'   => time(),
        'temp'         => round((float) ($m['temp'] ?? 0), 2),
        'feels_like'   => round((float) ($m['feels_like'] ?? 0), 2),
        'humidity'     => (int) ($m['humidity'] ?? 0),
        'pressure'     => (int) ($m['pressure'] ?? 0),
        'wind_speed'   => round((float) ($wind['speed'] ?? 0), 2),
        'wind_deg'     => (int) ($wind['deg'] ?? 0),
        'sunrise'      => (int) ($s['sunrise'] ?? 0),
        'sunset'       => (int) ($s['sunset'] ?? 0),
        'weather_id'   => (int) ($w['id'] ?? 800),
        'weather_main' => substr((string) ($w['main'] ?? ''), 0, 32),
        'weather_desc' => substr((string) ($w['description'] ?? ''), 0, 64),
        'weather_icon' => substr((string) ($w['icon'] ?? ''), 0, 8),
    ]);
}

/**
 * Appends one entry to wx_log per hour, per location. No rows are ever
 * deleted — the table is a permanent archive.
 */
function write_log(PDO $pdo, int $location_id, array $d, int $now): void
{
    $stmt = $pdo->prepare('
        SELECT recorded_at FROM wx_log
        WHERE location_id = :location_id
        ORDER BY recorded_at DESC
        LIMIT 1
    ');
    $stmt->execute(['location_id' => $location_id]);
    $last = $stmt->fetchColumn();

    if ($last !== false && (int) $last > $now - 3600) {
        return;
    }

    $m = $d['main'] ?? [];

    $stmt = $pdo->prepare('
        INSERT INTO wx_log (location_id, recorded_at, temp, humidity, pressure)
        VALUES (:location_id, :recorded_at, :temp, :humidity, :pressure)
    ');
    $stmt->execute([
        'location_id' => $location_id,
        'recorded_at' => $now,
        'temp'        => round((float) ($m['temp'] ?? 0), 2),
        'humidity'    => (int) ($m['humidity'] ?? 0),
        'pressure'    => (int) ($m['pressure'] ?? 0),
    ]);
}

function log_msg(string $msg): void
{
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}
