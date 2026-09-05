<?php
/**
 * GET /server/api/weather.php?location=<slug>
 *
 * Returns current conditions, hourly/daily forecast, and recent observation
 * history for one location, assembled from data the cron scripts already
 * fetched and stored — this endpoint never calls out to OpenWeatherMap.
 */

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$slug = $_GET['location'] ?? 'default';
if (!is_string($slug) || !preg_match('/^[a-z0-9-]{1,64}$/', $slug)) {
    wx_json_error('Invalid location.', 400);
}

$pdo = wx_db();
$location = wx_location_by_slug($pdo, $slug);

if (!$location) {
    wx_json_error('Unknown location.', 404);
}

$location_id = (int) $location['id'];
$current = fetch_current($pdo, $location_id);

if ($current === null) {
    wx_json_error('No data yet for this location.', 503);
}

wx_json_response([
    'location' => [
        'slug' => $location['slug'],
        'name' => $location['name'],
        'lat'  => (float) $location['lat'],
        'lon'  => (float) $location['lon'],
    ],
    'current' => $current,
    'hourly'  => fetch_hourly($pdo, $location_id),
    'daily'   => fetch_daily($pdo, $location_id),
    'log'     => fetch_log($pdo, $location_id),
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetch_current(PDO $pdo, int $location_id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM wx_current WHERE location_id = :location_id');
    $stmt->execute(['location_id' => $location_id]);
    $row = $stmt->fetch();

    if (!$row) {
        return null;
    }

    return [
        'fetched_at' => (int) $row['fetched_at'],
        'temp'       => (float) $row['temp'],
        'feels_like' => (float) $row['feels_like'],
        'humidity'   => (int) $row['humidity'],
        'pressure'   => (int) $row['pressure'],
        'dew_point'  => (float) $row['dew_point'],
        'uvi'        => (float) $row['uvi'],
        'wind_speed' => (float) $row['wind_speed'],
        'wind_deg'   => (int) $row['wind_deg'],
        'sunrise'    => (int) $row['sunrise'],
        'sunset'     => (int) $row['sunset'],
        'weather'    => [[
            'id'          => (int) $row['weather_id'],
            'main'        => $row['weather_main'],
            'description' => $row['weather_desc'],
            'icon'        => $row['weather_icon'],
        ]],
    ];
}

function fetch_hourly(PDO $pdo, int $location_id): array
{
    $stmt = $pdo->prepare('SELECT * FROM wx_hourly WHERE location_id = :location_id ORDER BY dt ASC');
    $stmt->execute(['location_id' => $location_id]);

    return array_map(static function (array $row): array {
        return [
            'dt'         => (int) $row['dt'],
            'temp'       => (float) $row['temp'],
            'feels_like' => (float) $row['feels_like'],
            'humidity'   => (int) $row['humidity'],
            'pressure'   => (int) $row['pressure'],
            'dew_point'  => (float) $row['dew_point'],
            'pop'        => (float) $row['pop'],
            'weather'    => [[
                'id'   => (int) $row['weather_id'],
                'main' => $row['weather_main'],
            ]],
        ];
    }, $stmt->fetchAll());
}

function fetch_daily(PDO $pdo, int $location_id): array
{
    $stmt = $pdo->prepare('SELECT * FROM wx_daily WHERE location_id = :location_id ORDER BY dt ASC');
    $stmt->execute(['location_id' => $location_id]);

    return array_map(static function (array $row): array {
        return [
            'dt'         => (int) $row['dt'],
            'sunrise'    => (int) $row['sunrise'],
            'sunset'     => (int) $row['sunset'],
            'moonrise'   => (int) $row['moonrise'],
            'moonset'    => (int) $row['moonset'],
            'moon_phase' => (float) $row['moon_phase'],
            'temp'       => [
                'min' => (float) $row['temp_min'],
                'max' => (float) $row['temp_max'],
            ],
            'weather'    => [[
                'id'   => (int) $row['weather_id'],
                'main' => $row['weather_main'],
            ]],
        ];
    }, $stmt->fetchAll());
}

function fetch_log(PDO $pdo, int $location_id): array
{
    $cutoff = time() - 48 * 3600;
    $stmt = $pdo->prepare('
        SELECT recorded_at, temp, humidity, pressure
        FROM wx_log
        WHERE location_id = :location_id AND recorded_at >= :cutoff
        ORDER BY recorded_at ASC
    ');
    $stmt->execute(['location_id' => $location_id, 'cutoff' => $cutoff]);

    return array_map(static function (array $row): array {
        return [
            't'        => (int) $row['recorded_at'] * 1000,
            'temp'     => (float) $row['temp'],
            'humidity' => (int) $row['humidity'],
            'pressure' => (int) $row['pressure'],
        ];
    }, $stmt->fetchAll());
}
