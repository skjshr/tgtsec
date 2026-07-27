<?php

declare(strict_types=1);

function site_notice_path(): string
{
    $configured = getenv('SITE_NOTICE_PATH');

    if (is_string($configured) && $configured !== '') {
        return $configured;
    }

    return dirname(__DIR__) . '/data/notice.txt';
}

function read_site_notice(): string
{
    $notice = @file_get_contents(site_notice_path());

    if ($notice === false || trim($notice) === '') {
        return '本日は通常どおり営業しています。';
    }

    return trim($notice);
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
