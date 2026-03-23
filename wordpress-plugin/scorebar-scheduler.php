<?php
/**
 * Plugin Name: Scheduler
 * Plugin URI:
 * Description: A sports schedule widget for your website.
 * Version: 1.1.6
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

if (!defined('SCHEDULE_PLUGIN_URL')) {
    define('SCHEDULE_PLUGIN_URL', plugin_dir_url(__FILE__));
}

// The Vercel app URL is hardcoded — the plugin is purpose-built for this endpoint.
if (!defined('SCHEDULE_APP_DOMAIN')) {
    define('SCHEDULE_APP_DOMAIN', 'https://score-bar-scheduler.vercel.app');
}

// Backward-compatible helper used by settings.php, shortcode.php, elementor-widget.php.
if (!function_exists('schedule_get_app_domain')) {
    function schedule_get_app_domain() {
        return SCHEDULE_APP_DOMAIN;
    }
}

// ── Ghost-entry cleanup helper ───────────────────────────────────────────────
// PHP 7.4-safe (no str_contains). Removes any active_plugins entry that either:
//   (a) contains our slug but doesn't match the canonical path, or
//   (b) matches the canonical path but the file no longer exists on disk.
// Called both on activation and on every plugins_loaded (before WP renders admin notices).
if (!function_exists('schedule_purge_ghost_entries')) {
    function schedule_purge_ghost_entries() {
        $canonical   = plugin_basename(__FILE__);
        $plugin_file = WP_PLUGIN_DIR . '/' . $canonical;
        $active      = get_option('active_plugins', []);

        $seen_ours = false;
        $cleaned   = [];
        foreach ($active as $entry) {
            if (strpos($entry, 'scorebar-scheduler') !== false) {
                // Keep the canonical entry only once and only if the file exists.
                if ($entry === $canonical && !$seen_ours && file_exists($plugin_file)) {
                    $cleaned[] = $entry;
                    $seen_ours = true;
                }
                // All other entries for our slug (wrong path, broken install, duplicate) are dropped.
            } else {
                $cleaned[] = $entry;
            }
        }
        $cleaned = array_values($cleaned);
        if ($cleaned !== array_values($active)) {
            update_option('active_plugins', $cleaned);
            if (function_exists('wp_clean_plugins_cache')) {
                wp_clean_plugins_cache(false);
            }
        }

        // Multisite: clean sitewide active plugins too
        if (function_exists('is_multisite') && is_multisite()) {
            $network_active = get_site_option('active_sitewide_plugins', []);
            $changed = false;
            foreach (array_keys($network_active) as $entry) {
                if (strpos($entry, 'scorebar-scheduler') !== false && $entry !== $canonical) {
                    unset($network_active[$entry]);
                    $changed = true;
                }
            }
            if ($changed) {
                update_site_option('active_sitewide_plugins', $network_active);
            }
        }
    }
}

// Run on activation (handles the install-time cleanup)
register_activation_hook(__FILE__, 'schedule_purge_ghost_entries');

// Run on every plugins_loaded — fires before admin notices are rendered, so the
// "Plugin file does not exist" notice never appears even on the first load after a
// broken/duplicate install. Priority 1 = as early as possible.
add_action('plugins_loaded', 'schedule_purge_ghost_entries', 1);

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

if (!function_exists('schedule_add_settings_link')) {
    function schedule_add_settings_link($links) {
        $settings_link = '<a href="admin.php?page=scheduler-settings">Settings</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'schedule_add_settings_link');

if (!function_exists('schedule_enqueue_editor_sync')) {
    function schedule_enqueue_editor_sync() {
        $api_key = get_option('schedule_api_key', '');
        if (empty($api_key)) return;
        $embed_token = get_option('schedule_embed_token', '');
        $sync_file = plugin_dir_path(__FILE__) . 'includes/elementor-editor-sync.js';
        $sync_ver  = file_exists($sync_file) ? filemtime($sync_file) : '1.0.0';
        wp_enqueue_script(
            'schedule-editor-sync',
            SCHEDULE_PLUGIN_URL . 'includes/elementor-editor-sync.js',
            [],
            (string)$sync_ver,
            true
        );
        wp_localize_script('schedule-editor-sync', '_sbEditorCfg', [
            'appUrl' => schedule_get_app_domain(),
            'apiKey' => $api_key,
        ]);
    }
}
add_action('elementor/editor/after_enqueue_scripts', 'schedule_enqueue_editor_sync');

// ── AJAX endpoint: return the CURRENT embed key (never baked into HTML) ─────
// Used by sbFireDelete() in schedule-frontend.js so the MutationObserver DELETE
// always sends the up-to-date key even if the user rotated it after the page was rendered.
if (!function_exists('schedule_ajax_get_token')) {
    function schedule_ajax_get_token() {
        check_ajax_referer('schedule_token_nonce');
        $embed_token = get_option('schedule_embed_token', '');
        $api_key     = get_option('schedule_api_key', '');
        $key = !empty($embed_token) ? $embed_token : $api_key;
        if (empty($key)) {
            wp_send_json_error('no_key', 403);
        }
        wp_send_json_success($key);
    }
}
add_action('wp_ajax_schedule_get_token',        'schedule_ajax_get_token');
add_action('wp_ajax_nopriv_schedule_get_token', 'schedule_ajax_get_token');

// ── Frontend script: inject _sbFrontendCfg (ajaxUrl + nonce + appUrl) ───────
// Enqueued on every front-end page load so that sbFireDelete() in the inline
// MutationObserver can resolve the live key via AJAX instead of using a stale
// value stamped into the HTML at render time.
if (!function_exists('schedule_enqueue_frontend_config')) {
    function schedule_enqueue_frontend_config() {
        $api_key = get_option('schedule_api_key', '');
        if (empty($api_key)) return;
        wp_enqueue_script(
            'schedule-frontend',
            SCHEDULE_PLUGIN_URL . 'includes/schedule-frontend.js',
            [],
            '1.0.1',
            true
        );
        wp_localize_script('schedule-frontend', '_sbFrontendCfg', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('schedule_token_nonce'),
            'appUrl'  => schedule_get_app_domain(),
        ]);
    }
}
add_action('wp_enqueue_scripts', 'schedule_enqueue_frontend_config');
