<?php
/**
 * Fetches current conditions plus the 48-hour hourly and 8-day daily
 * forecast from OWM's One Call API 3.0 for every active location.
 *
 * The current-conditions block from this call is used only to fill in the
 * fields fetch_current.php's lighter endpoint can't provide (dew_point,
 * uvi) — temp/humidity/pressure/etc. stay on the faster 10-minute cadence.
 *
 * Cron: once per hour
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
$exit_code = 0;

foreach ($locations as $location) {
    try {
        fetch_forecast_for_location($pdo, $location, $api_key);
        log_msg("OK: {$location['slug']}");
    } catch (Throwable $e) {
        $exit_code = 1;
        log_msg("ERROR ({$location['slug']}): " . $e->getMessage());
    }
}

exit($exit_code);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetch_forecast_for_location(PDO $pdo, array $location, string $api_key): void
{
    $url = sprintf(
        'https://api.openweathermap.org/data/3.0/onecall?units=imperial&exclude=minutely,alerts&lat=%F&lon=%F&appid=%s',
        $location['lat'],
        $location['lon'],
        $api_key
    );

    $raw = @file_get_contents($url);
    if ($raw === false) {
        throw new RuntimeException('HTTP request failed.');
    }

    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE || !isset($data['hourly'], $data['daily'])) {
        throw new RuntimeException('Invalid JSON response: ' . substr($raw, 0, 200));
    }

    $location_id = (int) $location['id'];

    $pdo->beginTransaction();
    try {
        write_hourly($pdo, $location_id, $data['hourly']);
        write_daily($pdo, $location_id, $data['daily']);
        write_astro($pdo, $location_id, $data['daily']);
        if (isset($data['current'])) {
            write_current_extras($pdo, $location_id, $data['current']);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function write_hourly(PDO $pdo, int $location_id, array $hours): void
{
    $stmt = $pdo->prepare('DELETE FROM wx_hourly WHERE location_id = :location_id');
    $stmt->execute(['location_id' => $location_id]);

    $stmt = $pdo->prepare('
        INSERT INTO wx_hourly (
            location_id, dt, temp, feels_like, humidity, pressure, dew_point, pop, weather_id, weather_main
        ) VALUES (
            :location_id, :dt, :temp, :feels_like, :humidity, :pressure, :dew_point, :pop, :weather_id, :weather_main
        )
    ');

    foreach ($hours as $h) {
        $w = $h['weather'][0] ?? [];
        $stmt->execute([
            'location_id'  => $location_id,
            'dt'           => (int) ($h['dt'] ?? 0),
            'temp'         => round((float) ($h['temp'] ?? 0), 2),
            'feels_like'   => round((float) ($h['feels_like'] ?? 0), 2),
            'humidity'     => (int) ($h['humidity'] ?? 0),
            'pressure'     => (int) ($h['pressure'] ?? 0),
            'dew_point'    => round((float) ($h['dew_point'] ?? 0), 2),
            'pop'          => round((float) ($h['pop'] ?? 0), 3),
            'weather_id'   => (int) ($w['id'] ?? 800),
            'weather_main' => substr((string) ($w['main'] ?? ''), 0, 32),
        ]);
    }
}

function write_daily(PDO $pdo, int $location_id, array $days): void
{
    $stmt = $pdo->prepare('DELETE FROM wx_daily WHERE location_id = :location_id');
    $stmt->execute(['location_id' => $location_id]);

    $stmt = $pdo->prepare('
        INSERT INTO wx_daily (
            location_id, dt, sunrise, sunset, moonrise, moonset, moon_phase, temp_min, temp_max, weather_id, weather_main
        ) VALUES (
            :location_id, :dt, :sunrise, :sunset, :moonrise, :moonset, :moon_phase, :temp_min, :temp_max, :weather_id, :weather_main
        )
    ');

    foreach ($days as $d) {
        $w = $d['weather'][0] ?? [];
        $stmt->execute([
            'location_id'  => $location_id,
            'dt'           => (int) ($d['dt'] ?? 0),
            'sunrise'      => (int) ($d['sunrise'] ?? 0),
            'sunset'       => (int) ($d['sunset'] ?? 0),
            'moonrise'     => (int) ($d['moonrise'] ?? 0),
            'moonset'      => (int) ($d['moonset'] ?? 0),
            'moon_phase'   => round((float) ($d['moon_phase'] ?? 0), 2),
            'temp_min'     => round((float) ($d['temp']['min'] ?? 0), 2),
            'temp_max'     => round((float) ($d['temp']['max'] ?? 0), 2),
            'weather_id'   => (int) ($w['id'] ?? 800),
            'weather_main' => substr((string) ($w['main'] ?? ''), 0, 32),
        ]);
    }
}

/**
 * Append-only mirror of the astro fields from write_daily(). Upserted per
 * day so past rows accumulate (wx_daily itself is wiped every run), giving
 * the frontend yesterday's sunrise/sunset for the delta display and a
 * permanent record for a historical view.
 */
function write_astro(PDO $pdo, int $location_id, array $days): void
{
    $stmt = $pdo->prepare('
        INSERT INTO wx_astro (location_id, dt, sunrise, sunset, moonrise, moonset, moon_phase)
        VALUES (:location_id, :dt, :sunrise, :sunset, :moonrise, :moonset, :moon_phase)
        ON DUPLICATE KEY UPDATE
            sunrise = VALUES(sunrise),
            sunset = VALUES(sunset),
            moonrise = VALUES(moonrise),
            moonset = VALUES(moonset),
            moon_phase = VALUES(moon_phase)
    ');

    foreach ($days as $d) {
        $dt = (int) ($d['dt'] ?? 0);
        if ($dt === 0) {
            continue;
        }
        $stmt->execute([
            'location_id' => $location_id,
            'dt'          => $dt,
            'sunrise'     => (int) ($d['sunrise'] ?? 0),
            'sunset'      => (int) ($d['sunset'] ?? 0),
            'moonrise'    => (int) ($d['moonrise'] ?? 0),
            'moonset'     => (int) ($d['moonset'] ?? 0),
            'moon_phase'  => round((float) ($d['moon_phase'] ?? 0), 2),
        ]);
    }
}

/**
 * Upsert so this works whether or not fetch_current.php has already
 * created the wx_current row for this location.
 */
function write_current_extras(PDO $pdo, int $location_id, array $current): void
{
    $stmt = $pdo->prepare('
        INSERT INTO wx_current (location_id, dew_point, uvi)
        VALUES (:location_id, :dew_point, :uvi)
        ON DUPLICATE KEY UPDATE
            dew_point = VALUES(dew_point),
            uvi = VALUES(uvi)
    ');
    $stmt->execute([
        'location_id' => $location_id,
        'dew_point'   => round((float) ($current['dew_point'] ?? 0), 2),
        'uvi'         => round((float) ($current['uvi'] ?? 0), 1),
    ]);
}

function log_msg(string $msg): void
{
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}
