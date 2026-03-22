<?php
/**
 * Runs when the plugin is deleted from the WordPress admin.
 * Cleans up all database options stored by the Scheduler plugin.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

delete_option('schedule_api_key');
delete_option('schedule_embed_token');
delete_transient('schedule_connection_status');

// Also remove any stale active_plugins ghost entries left by previous broken installs
$active = get_option('active_plugins', []);
$cleaned = array_values(array_filter($active, function ($entry) {
    return str_contains($entry, 'scorebar-scheduler') === false;
}));
if (count($cleaned) !== count($active)) {
    update_option('active_plugins', $cleaned);
}

if (is_multisite()) {
    delete_site_option('schedule_api_key');
    $network_active = get_site_option('active_sitewide_plugins', []);
    foreach (array_keys($network_active) as $entry) {
        if (str_contains($entry, 'scorebar-scheduler')) {
            unset($network_active[$entry]);
        }
    }
    update_site_option('active_sitewide_plugins', $network_active);
}

// ── Self-delete the plugin directory ───────────────────────────────────────
// WordPress's built-in file-deletion can silently fail on some hosts
// (permission issues, DirectAdmin lock, etc.), which leaves the folder on
// disk and causes a "Destination folder already exists" error on the next
// install. We do it ourselves here using PHP's native functions while we
// still have a running process with access to the files.
// Note: deleting the folder we are currently running from is safe on Linux
// because the OS keeps the inode alive until the process exits.
function _sched_rmdir_recursive($dir) {
    if (!is_dir($dir)) return;
    $items = @scandir($dir);
    if ($items === false) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . '/' . $item;
        if (is_dir($path) && !is_link($path)) {
            _sched_rmdir_recursive($path);
        } else {
            @unlink($path);
        }
    }
    @rmdir($dir);
}

_sched_rmdir_recursive(WP_PLUGIN_DIR . '/scorebar-scheduler');
