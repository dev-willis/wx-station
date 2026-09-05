<?php
/**
 * Shared bootstrap for the api/ endpoints — the only PHP under the web root.
 *
 * Everything the endpoints depend on (config, db.php, lib/) lives in the
 * "app directory". In a split deployment that directory sits OUTSIDE the web
 * root, so there is nothing non-public to serve by accident; WX_APP_DIR (set
 * in the PHP-FPM pool / vhost) points to it. When the repo is checked out
 * intact — local dev, CI — the app directory is just the parent of api/, so
 * the fallback keeps that working with no configuration.
 */

declare(strict_types=1);

$wx_app_dir = getenv('WX_APP_DIR') ?: dirname(__DIR__);

if (!is_file($wx_app_dir . '/db.php')) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Server misconfigured: app directory not found.']);
    exit;
}

require $wx_app_dir . '/db.php';
require $wx_app_dir . '/lib/http.php';
require $wx_app_dir . '/lib/locations.php';
