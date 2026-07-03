<?php
/**
 * wx/cron/fetch_current.php
 *
 * Fetches current conditions from OWM /data/2.5/weather and writes
 * to wx_current. Also appends one observation per hour to wx_log.
 *
 * Cron: every 10 minutes
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

$url = sprintf(
    'https://api.openweathermap.org/data/2.5/weather?units=imperial&lat=%f&lon=%f&appid=%s',
    $lat, $lon, $api_key
);

$raw = @file_get_contents($url);

if ($raw === false) {
    log_msg('ERROR: HTTP request failed.');
    exit(1);
}

$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE || !isset($data['main'])) {
    log_msg('ERROR: Invalid JSON response: ' . substr($raw, 0, 200));
    exit(1);
}

$now = time();

/** @var PDO $pdo */
$pdo = $modx->connection->getConnection();

try {
    $pdo->beginTransaction();

    write_current($modx, $data);
    write_log($modx, $data, $now);     // no-op if < 60 min since last entry

    $pdo->commit();
    log_msg('OK at ' . date('Y-m-d H:i:s', $now));

} catch (Throwable $e) {
    $pdo->rollBack();
    log_msg('ERROR: ' . $e->getMessage());
    exit(1);
}

// Flush snippet cache so the next page load gets fresh current conditions
$modx->cacheManager->delete('wx_json', ['cache_key' => 'wx']);

exit(0);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * OWM /data/2.5/weather uses a different shape than One Call, so field
 * mapping differs slightly from the original write_current().
 */
function write_current(modX $modx, array $d): void
{
    $obj = $modx->getObject('WxCurrent', 1);
    if (!$obj) {
        $obj = $modx->newObject('WxCurrent');
        $obj->set('id', 1);
    }

    $m = $d['main']    ?? [];
    $w = $d['weather'][0] ?? [];
    $s = $d['sys']     ?? [];
    $wind = $d['wind'] ?? [];

    $obj->fromArray([
        'fetched_at'   => time(),
        'temp'         => round((float)($m['temp']       ?? 0), 2),
        'feels_like'   => round((float)($m['feels_like'] ?? 0), 2),
        'humidity'     => (int)($m['humidity']  ?? 0),
        'pressure'     => (int)($m['pressure']  ?? 0),
        // /2.5/weather does not return dew_point or uvi — preserve existing values
        'wind_speed'   => round((float)($wind['speed'] ?? 0), 2),
        'wind_deg'     => (int)($wind['deg']    ?? 0),
        'sunrise'      => (int)($s['sunrise']   ?? 0),
        'sunset'       => (int)($s['sunset']    ?? 0),
        'weather_id'   => (int)($w['id']        ?? 800),
        'weather_main' => substr((string)($w['main']        ?? ''), 0, 32),
        'weather_desc' => substr((string)($w['description'] ?? ''), 0, 64),
        'weather_icon' => substr((string)($w['icon']        ?? ''), 0, 8),
    ]);

    $obj->save();
}

/**
 * Appends one entry to wx_log per hour.
 * No rows are ever deleted — the table is a permanent archive.
 */
function write_log(modX $modx, array $d, int $now): void
{
    $last = $modx->getObject('WxLog', [
        'ORDER BY' => 'recorded_at DESC',
        'LIMIT'    => 1,
    ]);

    // One entry per hour
    $threshold = $now - (60 * 60);
    if ($last && (int)$last->get('recorded_at') > $threshold) {
        return;
    }

    $m = $d['main'] ?? [];

    $entry = $modx->newObject('WxLog');
    $entry->fromArray([
        'recorded_at' => $now,
        'temp'        => round((float)($m['temp']     ?? 0), 2),
        'humidity'    => (int)($m['humidity'] ?? 0),
        'pressure'    => (int)($m['pressure'] ?? 0),
    ]);
    $entry->save();
}

function log_msg(string $msg): void
{
    echo '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
}