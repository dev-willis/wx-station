<?php
/**
 * Shared bootstrap for the api/ endpoints — the only PHP under the web root.
 *
 * Everything the endpoints depend on (config, db.php, lib/) lives in the
 * "app directory", which in a split deployment sits OUTSIDE the web root so
 * there is nothing non-public to serve by accident.
 *
 * The app directory is located, in order:
 *   1. $_SERVER['WX_APP_DIR']  — Apache SetEnv, nginx fastcgi_param, etc.
 *   2. getenv('WX_APP_DIR')    — PHP-FPM pool `env[WX_APP_DIR]`, CLI export
 *   3. api/app_dir.php         — a gitignored file that `return`s the path
 *                                (use this on hosts where you can't set env)
 *   4. dirname(__DIR__)        — intact checkout: everything still under server/
 */

declare(strict_types=1);

$wx_app_dir = '';

if (!empty($_SERVER['WX_APP_DIR'])) {
    $wx_app_dir = (string) $_SERVER['WX_APP_DIR'];
} elseif (getenv('WX_APP_DIR') !== false && getenv('WX_APP_DIR') !== '') {
    $wx_app_dir = (string) getenv('WX_APP_DIR');
} elseif (is_file(__DIR__ . '/app_dir.php')) {
    $wx_app_dir = (string) require __DIR__ . '/app_dir.php';
} else {
    $wx_app_dir = dirname(__DIR__);
}

$wx_app_dir = rtrim($wx_app_dir, '/');

if ($wx_app_dir === '' || !is_file($wx_app_dir . '/db.php')) {
    error_log('wx-station: app directory not found (tried "' . $wx_app_dir . '"). '
        . 'Set WX_APP_DIR or create server/api/app_dir.php.');
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Server misconfigured: app directory not found.',
        'tried' => $wx_app_dir . '/db.php',
    ]);
    exit;
}

require $wx_app_dir . '/db.php';
require $wx_app_dir . '/lib/http.php';
require $wx_app_dir . '/lib/locations.php';
