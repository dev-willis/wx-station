<?php
declare(strict_types=1);

function wx_json_response($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

function wx_json_error(string $message, int $status = 400): void
{
    wx_json_response(['error' => $message], $status);
}
