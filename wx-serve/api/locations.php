<?php
/**
 * GET /server/api/locations.php
 *
 * Lists the active locations available to query via weather.php.
 */

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$pdo = wx_db();

wx_json_response(array_map(static function (array $row): array {
    return [
        'slug' => $row['slug'],
        'name' => $row['name'],
        'lat'  => (float) $row['lat'],
        'lon'  => (float) $row['lon'],
    ];
}, wx_active_locations($pdo)));
