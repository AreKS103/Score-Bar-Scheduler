<?php
/**
 * Plugin Name: Scheduler
 * Plugin URI: https://score-bar-scheduler.vercel.app/
 * Description: A white-label sports schedule widget for your website.
 * Version: 1.1.0
 * Author: Scorebar
 * Text Domain: scorebar-scheduler
 * Requires at least: 6.0
 * Tested up to: 6.7
 * Requires PHP: 7.4
 */
if (!defined('ABSPATH')) exit;

// ── PHP version gate ────────────────────────────────────────────────────────
if (version_compare(PHP_VERSION, '7.4', '<')) {
    add_action('admin_notices', function () {
        echo '<div class="notice notice-error"><p><strong>Scheduler:</strong> requires PHP 7.4 or higher. Your server is running PHP ' . esc_html(PHP_VERSION) . '. Please upgrade PHP or contact your host.</p></div>';
    });
    return;
}

if (!defined('SCOREBAR_APP_PLUGIN_URL')) {
    define('SCOREBAR_APP_PLUGIN_URL', plugin_dir_url(__FILE__));
}
if (!defined('SCOREBAR_APP_VERCEL_DOMAIN')) {
    // Allow override from wp-config.php: define('SCOREBAR_APP_BASE_URL', 'http://localhost:3000');
    if (defined('SCOREBAR_APP_BASE_URL') && SCOREBAR_APP_BASE_URL) {
        define('SCOREBAR_APP_VERCEL_DOMAIN', rtrim(SCOREBAR_APP_BASE_URL, '/'));
    } else {
        define('SCOREBAR_APP_VERCEL_DOMAIN', 'https://score-bar-scheduler.vercel.app');
    }
}

// ── Load plugin files defensively ─────────────────────────────────────────
$_plugin_dir = plugin_dir_path(__FILE__);
$_required = [
    'includes/settings.php',
    'includes/shortcode.php',
    'includes/elementor-init.php',
];
foreach ($_required as $_file) {
    $fp = $_plugin_dir . $_file;
    if (file_exists($fp)) {
        require_once $fp;
    } else {
        add_action('admin_notices', function () use ($_file) {
            echo '<div class="notice notice-warning"><p><strong>Scheduler:</strong> Missing plugin file: ' . esc_html($_file) . '. Try re-installing the plugin.</p></div>';
        });
    }
}
unset($_plugin_dir, $_required, $_file, $fp);

if (!function_exists('scorebar_app_add_settings_link')) {
    function scorebar_app_add_settings_link($links) {
        $settings_link = '<a href="admin.php?page=scorebar-scheduler">Settings</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'scorebar_app_add_settings_link');
