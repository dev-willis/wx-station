<?php
/**
 * wx/cron/fetch_forecast.php
 *
 * Fetches the 48-hour hourly and 7-day daily forecast from the OWM
 * One Call API 3.0. Current conditions and logging are handled by
 * fetch_current.php, so both are excluded from this request.
 *
 * Cron: once per hour
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('CLI only.');
}

define('MODX_CORE_PATH',  '/home/www/core/');
define('MODX_CONFIG_KEY', 'config');

require_once MODX_CORE_PATH . 'model/modx/modx.class.php';

$modx = new modX();
$modx->initialize('mgr');
$modx->setLogLevel(modX::LOG_LEVEL_ERROR);
$modx->addPackage('wx', MODX_CORE_PATH . 'components/wx/model/');

$api_key = $modx->getOption('wx.api_key');
$lat     = (float) $modx->getOption('wx.lat', null, 36.16754647878633);
$lon     = (float) $modx->getOption('wx.lon', null, -86.21153419024921);

if (empty($api_key)) {
    log_msg('FATAL: wx.api_key system setting is not set.');
    exit(1);
}

// Exclude current, minutely, and alerts — we only need hourly and daily
$url = sprintf(
    'https://api.openweathermap.org/data/3.0/onecall?units=imperial&exclude=current,minutely,alerts&lat=%f&lon=%f&appid=%s',
    $lat, $lon, $api_key
);

$raw = @file_get_contents($url);

if ($raw === false) {
    log_msg('ERROR: HTTP request failed.');
    exit(1);
}

$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE || !isset($data['hourly'])) {
    log_msg('ERROR: Invalid JSON response: ' . substr($raw, 0, 200));
    exit(1);
}

$now = time();

/** @var PDO $pdo */
$pdo = $modx->connection->getConnection();

try {
    $pdo->beginTransaction();

    write_hourly($modx, $data['hourly'] ?? []);
    write_daily($modx,  $data['daily']  ?? []);

    $pdo->commit();
    log_msg('OK at ' . date('Y-m-d H:i:s', $now));

} catch (Throwable $e) {
    $pdo->rollBack();
    log_msg('ERROR: ' . $e->getMessage());
    exit(1);
}

// Flush snippet cache after a forecast update as well
$modx->cacheManager->delete('wx_json', ['cache_key' => 'wx']);

exit(0);

// ── Helpers ──────────────────────────────────────────────────────────────────

function write_hourly(modX $modx, array $hours): void
{
    $modx->removeCollection('WxHourly', []);

    foreach ($hours as $h) {
        $obj = $modx->newObject('WxHourly');
        $w   = $h['weather'][0] ?? [];

        $obj->fromArray([
            'dt'           => (int)($h['dt']         ?? 0),
            'temp'         => round((float)($h['temp']       ?? 0), 2),
            'feels_like'   => round((float)($h['feels_like'] ?? 0), 2),
            'humidity'     => (int)($h['humidity']   ?? 0),
            'pressure'     => (int)($h['pressure']   ?? 0),
            'dew_point'    => round((float)($h['dew_point']  ?? 0), 2),
            'pop'          => round((float)($h['pop']        ?? 0), 3),
            'weather_id'   => (int)($w['id']         ?? 800),
            'weather_main' => substr((string)($w['main'] ?? ''), 0, 32),
        ]);

        $obj->save();
    }
}

function write_daily(modX $modx, array $days): void
{
    $modx->removeCollection('WxDaily', []);

    foreach ($days as $d) {
        $obj = $modx->newObject('WxDaily');
        $w   = $d['weather'][0] ?? [];

        $obj->fromArray([
            'dt'           => (int)($d['dt']          ?? 0),
            'sunrise'      => (int)($d['sunrise']     ?? 0),
            'sunset'       => (int)($d['sunset']      ?? 0),
            'moonrise'     => (int)($d['moonrise']    ?? 0),
            'moonset'      => (int)($d['moonset']     ?? 0),
            'moon_phase'   => round((float)($d['moon_phase'] ?? 0), 2),
            'temp_min'     => round((float)($d['temp']['min'] ?? 0), 2),
            'temp_max'     => round((float)($d['temp']['max'] ?? 0), 2),
            'weather_id'   => (int)($w['id']          ?? 800),
            'weather_main' => substr((string)($w['main'] ?? ''), 0, 32),
        ]);

        $obj->save();
    }
}

function log_msg(string $msg): void
{
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}