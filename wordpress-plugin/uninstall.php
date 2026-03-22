<?php
/**
 * Runs when the plugin is deleted from the WordPress admin.
 * Cleans up all database options stored by the Scheduler plugin.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

delete_option('scorebar_app_api_key');
delete_option('scorebar_embed_token');
delete_transient('scorebar_connection_status');

// Also remove any stale active_plugins ghost entries left by previous broken installs
$active = get_option('active_plugins', []);
$cleaned = array_values(array_filter($active, function ($entry) {
    return str_contains($entry, 'scorebar-scheduler') === false;
}));
if (count($cleaned) !== count($active)) {
    update_option('active_plugins', $cleaned);
}

if (is_multisite()) {
    delete_site_option('scorebar_app_api_key');
    $network_active = get_site_option('active_sitewide_plugins', []);
    foreach (array_keys($network_active) as $entry) {
        if (str_contains($entry, 'scorebar-scheduler')) {
            unset($network_active[$entry]);
        }
    }
    update_site_option('active_sitewide_plugins', $network_active);
}
