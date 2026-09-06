<?php
declare(strict_types=1);

/**
 * Range readers for the two append-only history tables, shared by
 * api/weather.php (fixed recent window) and api/history.php (arbitrary
 * range). Both return rows oldest-first, shaped for the frontend.
 */

function wx_log_between(PDO $pdo, int $location_id, int $from, int $to): array
{
    $stmt = $pdo->prepare('
        SELECT recorded_at, temp, humidity, pressure
        FROM wx_log
        WHERE location_id = :location_id AND recorded_at BETWEEN :from AND :to
        ORDER BY recorded_at ASC
    ');
    $stmt->execute(['location_id' => $location_id, 'from' => $from, 'to' => $to]);

    return array_map(static function (array $row): array {
        return [
            't'        => (int) $row['recorded_at'] * 1000,
            'temp'     => (float) $row['temp'],
            'humidity' => (int) $row['humidity'],
            'pressure' => (int) $row['pressure'],
        ];
    }, $stmt->fetchAll());
}

function wx_astro_between(PDO $pdo, int $location_id, int $from, int $to): array
{
    $stmt = $pdo->prepare('
        SELECT dt, sunrise, sunset, moonrise, moonset, moon_phase
        FROM wx_astro
        WHERE location_id = :location_id AND dt BETWEEN :from AND :to
        ORDER BY dt ASC
    ');
    $stmt->execute(['location_id' => $location_id, 'from' => $from, 'to' => $to]);

    return array_map(static function (array $row): array {
        return [
            'dt'         => (int) $row['dt'],
            'sunrise'    => (int) $row['sunrise'],
            'sunset'     => (int) $row['sunset'],
            'moonrise'   => (int) $row['moonrise'],
            'moonset'    => (int) $row['moonset'],
            'moon_phase' => (float) $row['moon_phase'],
        ];
    }, $stmt->fetchAll());
}
