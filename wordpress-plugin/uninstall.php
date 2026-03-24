<?php
/**
 * Runs when the plugin is deleted from the WordPress admin.
 * Cleans up all database options stored by the Scheduler plugin.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

// ── Notify the Supabase backend to clean up embed instances for this site ──
// This fires a best-effort DELETE to the app so stale rows don't accumulate.
$api_key = get_option('schedule_api_key', '');
if ($api_key) {
    // Resolve app URL: option > wp-config constant. Skip cleanup if not configured.
    $from_option = get_option('schedule_app_url', '');
    if (!empty($from_option)) {
        $app_url = rtrim($from_option, '/');
    } elseif (defined('SCHEDULE_APP_BASE_URL') && SCHEDULE_APP_BASE_URL) {
        $app_url = rtrim(SCHEDULE_APP_BASE_URL, '/');
    } else {
        $app_url = '';
    }
    if (!empty($app_url)) {
        $endpoint = $app_url . '/api/embed-instances?embedId=__all__&apiKey=' . urlencode($api_key);
        wp_remote_request($endpoint, [
            'method'  => 'DELETE',
            'timeout' => 5,
            'blocking' => false,
        ]);
    }
}

delete_option('schedule_api_key');
delete_option('schedule_embed_token');
delete_option('schedule_app_url');
delete_transient('schedule_connection_status');

// Also remove any stale active_plugins ghost entries left by previous broken installs
$active = get_option('active_plugins', []);
$cleaned = array_values(array_filter($active, function ($entry) {
    return strpos($entry, 'scorebar-scheduler') === false;
}));
if (count($cleaned) !== count($active)) {
    update_option('active_plugins', $cleaned);
}

if (is_multisite()) {
    delete_site_option('schedule_api_key');
    $network_active = get_site_option('active_sitewide_plugins', []);
    foreach (array_keys($network_active) as $entry) {
        if (strpos($entry, 'scorebar-scheduler') !== false) {
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
function _sched_rmdir_recursive($dir, $allowed_base = null) {
    if ($allowed_base === null) {
        $allowed_base = realpath($dir);
        if ($allowed_base === false) return; // non-existent or unresolvable
    }
    if (!is_dir($dir)) return;
    $items = @scandir($dir);
    if ($items === false) return;
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . '/' . $item;
        // Guard against path traversal via symlinks or crafted filenames
        $real_path = realpath($path);
        if ($real_path === false || strpos($real_path, $allowed_base) !== 0) continue;
        if (is_dir($path) && !is_link($path)) {
            _sched_rmdir_recursive($path, $allowed_base);
        } else {
            @unlink($real_path);
        }
    }
    @rmdir($dir);
}

_sched_rmdir_recursive(WP_PLUGIN_DIR . '/scorebar-scheduler');
