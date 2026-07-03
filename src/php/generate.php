<?php
/**
 * One-time script: generates xPDO model classes and creates DB tables.
 * Run once, then DELETE this file.
 */

// ── Bootstrap MODX ──────────────────────────────────────────────────────────
$modx_core = '/paas/c0352/www/core'; //dirname(__DIR__, 4); // adjust if your component is not under core/
define('MODX_CORE_PATH', $modx_core . '/');
define('MODX_CONFIG_KEY',  'config');

require_once MODX_CORE_PATH . 'model/modx/modx.class.php';
$modx = new modX();
$modx->initialize('mgr');
$modx->setLogLevel(modX::LOG_LEVEL_INFO);
$modx->setLogTarget('ECHO');

// ── Paths ────────────────────────────────────────────────────────────────────
$pkg_name   = 'wx';
$pkg_path   = MODX_CORE_PATH . 'components/wx/';
$schema_dir = $pkg_path . 'schema/';
$model_dir  = $pkg_path . 'model/';
$schema_file = $schema_dir . 'wx.mysql.schema.xml';

// ── Generate model classes ────────────────────────────────────────────────────
$manager   = $modx->getManager();
$generator = $manager->getGenerator();

$generator->parseSchema($schema_file, $model_dir);
echo "Model classes generated.\n";

// ── Add package and create tables ────────────────────────────────────────────
$modx->addPackage($pkg_name, $model_dir);

foreach (['WxCurrent', 'WxHourly', 'WxDaily', 'WxLog'] as $class) {
    $manager->createObjectContainer($class);
    echo "Table created for {$class}.\n";
}

echo "Done. DELETE this file now.\n";