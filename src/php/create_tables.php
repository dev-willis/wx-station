<?php
if (PHP_SAPI !== 'cli') exit('CLI only.');

define('MODX_CORE_PATH',  '/paas/c0352/www/core/');
define('MODX_CONFIG_KEY', 'config');

// Grab the Composer autoloader instance before bootstrapping MODX
$loader = require MODX_CORE_PATH . 'vendor/autoload.php';

require_once MODX_CORE_PATH . 'model/modx/modx.class.php';

$modx = new modX();
$modx->initialize('mgr');
$modx->setLogLevel(modX::LOG_LEVEL_INFO);
$modx->setLogTarget('ECHO');

$pkg_path = MODX_CORE_PATH . 'components/wx/model/';

// Register the wx\ namespace with PSR-4 so PHP can actually find the classes
$loader->addPsr4('wx\\', $pkg_path . 'wx/');

// Now addPackage can resolve the classes correctly
$modx->addPackage('wx', $pkg_path, null, 'wx\\');

$manager = $modx->getManager();

foreach (['WxCurrent', 'WxHourly', 'WxDaily', 'WxLog'] as $class) {
    if (!$modx->loadClass($class)) {
        echo "FAILED to load class {$class}\n";
        continue;
    }

    $table  = $modx->getTableName($class);
    $result = $manager->createObjectContainer($class);

    if ($result) {
        echo "OK: created table {$table}\n";
    } else {
        echo "FAILED: could not create table {$table}\n";
    }
}