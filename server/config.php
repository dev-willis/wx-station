<?php
declare(strict_types=1);

$config = [
    'db' => [
        'host' => getenv('WX_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('WX_DB_PORT') ?: '3306',
        'name' => getenv('WX_DB_NAME') ?: 'wx_station',
        'user' => getenv('WX_DB_USER') ?: 'wx_station',
        'pass' => getenv('WX_DB_PASS') ?: '',
    ],
    'owm_api_key' => getenv('WX_OWM_API_KEY') ?: '',
];

// Optional file override for credentials, checked instead of/in addition to
// env vars. WX_CONFIG_FILE lets it live outside the web root entirely (see
// server/README.md for the recommended location); falling back to
// config.local.php here is only for convenience on local dev boxes.
$local = getenv('WX_CONFIG_FILE') ?: (__DIR__ . '/config.local.php');
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}

return $config;
