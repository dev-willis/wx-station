<?php
/**
 * GET /server/api/history.php?location=<slug>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *
 * Raw archive for one location over an arbitrary date range: the hourly
 * observation log (wx_log) and the daily astronomical events (wx_astro).
 * Both tables are append-only, so this is the basis for a historical view.
 *
 * `from`/`to` are inclusive calendar dates in UTC; both are optional and
 * default to the last 7 days. The range is capped at 366 days.
 */

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$slug = $_GET['location'] ?? 'default';
if (!is_string($slug) || !preg_match('/^[a-z0-9-]{1,64}$/', $slug)) {
    wx_json_error('Invalid location.', 400);
}

$now = time();
$to = parse_ymd_utc($_GET['to'] ?? null, $now);
$from = parse_ymd_utc($_GET['from'] ?? null, $to - 7 * 86400);

if ($from > $to) {
    wx_json_error('"from" is after "to".', 400);
}
if ($to - $from > 366 * 86400) {
    wx_json_error('Range too large (max 366 days).', 400);
}

$pdo = wx_db();
$location = wx_location_by_slug($pdo, $slug);

if (!$location) {
    wx_json_error('Unknown location.', 404);
}

$location_id = (int) $location['id'];

wx_json_response([
    'location' => [
        'slug' => $location['slug'],
        'name' => $location['name'],
        'lat'  => (float) $location['lat'],
        'lon'  => (float) $location['lon'],
    ],
    'from'  => $from,
    'to'    => $to,
    'log'   => wx_log_between($pdo, $location_id, $from, $to),
    'astro' => wx_astro_between($pdo, $location_id, $from, $to),
]);

function parse_ymd_utc($value, int $default): int
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return $default;
    }

    $ts = strtotime($value . ' 00:00:00 UTC');

    return $ts === false ? $default : $ts;
}
