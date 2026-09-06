<?php
declare(strict_types=1);

function wx_active_locations(PDO $pdo): array
{
    return $pdo->query('SELECT id, slug, name, lat, lon FROM wx_locations WHERE active = 1')->fetchAll();
}

function wx_location_by_slug(PDO $pdo, string $slug): ?array
{
    $stmt = $pdo->prepare('SELECT id, slug, name, lat, lon FROM wx_locations WHERE slug = :slug AND active = 1');
    $stmt->execute(['slug' => $slug]);
    $row = $stmt->fetch();

    return $row ?: null;
}
