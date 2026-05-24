<?php
/**
 * Plugin Name: Scheduler
 * Plugin URI:
 * Description: A sports schedule widget for your website.
 * Version: 1.2.25
 * Text Domain: scorebar-scheduler
 * Requires at least: 6.0
 * Tested up to: 6.7
 * Requires PHP: 7.4
 * Update URI: https://scorebar.vercel.app
 */
if (!defined('ABSPATH')) exit;

// Plugin version — must match the "Version:" header above.
define('SCHEDULE_PLUGIN_VERSION', '1.2.25');

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
    define('SCHEDULE_APP_DOMAIN', 'https://scorebar.vercel.app');
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

// On activation: clear stale update transient so WP re-checks on next load.
register_activation_hook(__FILE__, function() {
    delete_transient('scorebar_update_check');
});

// Ghost-entry cleanup runs on every plugins_loaded at priority 1 — this fires
// before admin notices so the "plugin file does not exist" banner never appears.
// Priority 1 = as early as possible, before other plugins or WP renders UI.
add_action('plugins_loaded', 'schedule_purge_ghost_entries', 1);

// ── Load plugin files defensively ─────────────────────────────────────────
$_plugin_dir = plugin_dir_path(__FILE__);
$_required = [
    'includes/settings.php',
    'includes/seo.php',
    'includes/shortcode.php',
    'includes/elementor-init.php',
    'includes/overflow-diagnostic.php',
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

// ── Auto-update checker ───────────────────────────────────────────────────────
// Modern approach (WP 5.8+): uses the "Update URI" plugin header.
// WordPress extracts the hostname from the header and calls this filter,
// which returns remote version info. WP handles the version comparison.
if (!function_exists('schedule_handle_update_check')) {
    function schedule_handle_update_check($update, $plugin_data, $plugin_file, $locales) {
        $cached = get_transient('scorebar_update_check');

        if (false === $cached) {
            $result = wp_remote_get(
                schedule_get_app_domain() . '/api/plugin/update',
                ['timeout' => 10, 'sslverify' => true]
            );
            if (!is_wp_error($result) && 200 === wp_remote_retrieve_response_code($result)) {
                $cached = json_decode(wp_remote_retrieve_body($result), true);
                set_transient('scorebar_update_check', $cached, 5 * MINUTE_IN_SECONDS);
            }
        }

        if (empty($cached['version'])) {
            return $update;
        }

        return [
            'slug'         => 'scorebar-scheduler',
            'version'      => $cached['version'],
            'new_version'  => $cached['version'],
            'url'          => 'https://scorebar.vercel.app',
            'package'      => $cached['download_url'] ?? '',
            'icons'        => [],
            'banners'      => [],
            'requires'     => $cached['requires']     ?? '6.0',
            'tested'       => $cached['tested']       ?? '6.7',
            'requires_php' => $cached['requires_php'] ?? '7.4',
        ];
    }
}
add_filter('update_plugins_scorebar.vercel.app', 'schedule_handle_update_check', 10, 4);

// Legacy fallback: still hook pre_set_site_transient_update_plugins so that
// older installs (without the Update URI header) can detect new versions.
if (!function_exists('schedule_check_for_plugin_update')) {
    function schedule_check_for_plugin_update($transient) {
        $plugin_file = plugin_basename(__FILE__);

        // Use the constant as fallback — don't bail on empty $transient->checked.
        $installed_version = SCHEDULE_PLUGIN_VERSION;
        if (!empty($transient->checked) && isset($transient->checked[$plugin_file])) {
            $installed_version = $transient->checked[$plugin_file];
        }

        $cached = get_transient('scorebar_update_check');

        if (false === $cached) {
            $result = wp_remote_get(
                schedule_get_app_domain() . '/api/plugin/update',
                ['timeout' => 10, 'sslverify' => true]
            );
            if (!is_wp_error($result) && 200 === wp_remote_retrieve_response_code($result)) {
                $cached = json_decode(wp_remote_retrieve_body($result), true);
                set_transient('scorebar_update_check', $cached, 5 * MINUTE_IN_SECONDS);
            }
        }

        $remote_version = $cached['version']      ?? '';
        $download_url   = $cached['download_url'] ?? '';

        if (
            !empty($remote_version) &&
            version_compare($remote_version, $installed_version, '>')
        ) {
            $transient->response[$plugin_file] = (object) [
                'id'           => $plugin_file,
                'slug'         => 'scorebar-scheduler',
                'plugin'       => $plugin_file,
                'new_version'  => $remote_version,
                'url'          => 'https://scorebar.vercel.app',
                'package'      => $download_url,
                'icons'        => [],
                'banners'      => [],
                'banners_rtl'  => [],
                'requires'     => '6.0',
                'tested'       => '6.7',
                'requires_php' => '7.4',
            ];
        }

        return $transient;
    }
}
add_filter('pre_set_site_transient_update_plugins', 'schedule_check_for_plugin_update');

// ── Plugin information popup ("View Details" link) ────────────────────────────
if (!function_exists('schedule_plugin_api_info')) {
    function schedule_plugin_api_info($result, $action, $args) {
        if ($action !== 'plugin_information' || ($args->slug ?? '') !== 'scorebar-scheduler') {
            return $result;
        }

        $cached = get_transient('scorebar_update_check');
        if (empty($cached)) {
            return $result;
        }

        return (object) [
            'name'          => 'Scheduler',
            'slug'          => 'scorebar-scheduler',
            'version'       => $cached['version'] ?? SCHEDULE_PLUGIN_VERSION,
            'author'        => '<a href="https://scorebar.vercel.app">Score Bar</a>',
            'homepage'      => 'https://scorebar.vercel.app',
            'download_link' => $cached['download_url'] ?? '',
            'requires'      => $cached['requires']     ?? '6.0',
            'tested'        => $cached['tested']       ?? '6.7',
            'requires_php'  => $cached['requires_php'] ?? '7.4',
            'sections'      => [
                'description' => 'A sports schedule widget for your website. Display customizable sports schedules and score bars on any WordPress page.',
            ],
        ];
    }
}
add_filter('plugins_api', 'schedule_plugin_api_info', 10, 3);

// ── REST API: /wp-json/scorebar/v1/connect ────────────────────────────────────
// The Setup Wizard on scorebar.vercel.app redirects the browser here so the
// plugin can receive the API key and complete the handshake without the user
// having to copy-paste anything.
//
// Flow:
//   1. User enters their site URL in the wizard.
//   2. scorebar.vercel.app generates an API token (key hash) and redirects to:
//        https://{their-site}/wp-json/scorebar/v1/connect?token=HASH&callback=CALLBACK_URL
//   3. This handler validates the token, stores it, then redirects back to CALLBACK_URL.
//   4. The callback endpoint (on scorebar.vercel.app) finalises the DB record.
add_action('rest_api_init', function () {
    register_rest_route('scorebar/v1', '/connect', [
        'methods'             => WP_REST_Server::READABLE,   // GET — browser redirect
        'callback'            => 'schedule_rest_connect_handler',
        'permission_callback' => '__return_true',            // Public; auth is the token itself
        'args'                => [
            'token' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'description'       => 'SHA-256 API key hash from scorebar.vercel.app',
            ],
            'callback' => [
                'required'          => true,
                'type'              => 'string',
                'sanitize_callback' => 'esc_url_raw',
                'description'       => 'Callback URL on scorebar.vercel.app to redirect back to',
            ],
        ],
    ]);
});

if (!function_exists('schedule_rest_connect_handler')) {
    function schedule_rest_connect_handler(WP_REST_Request $request) {
        $token        = $request->get_param('token');
        $callback_url = $request->get_param('callback');

        // ── 1. Validate token ─────────────────────────────────────────────
        // Must be a 64-char lowercase hex string (SHA-256 hash).
        if (empty($token) || !preg_match('/^[0-9a-f]{64}$/', $token)) {
            return new WP_Error(
                'invalid_token',
                'Invalid token. Expected a 64-character hex string.',
                ['status' => 400],
            );
        }

        // ── 2. Validate callback host ──────────────────────────────────────
        // Only allow redirects back to the official Scorebar domain to
        // prevent open-redirect exploitation.
        $parsed = wp_parse_url($callback_url);
        if (empty($parsed['host']) || $parsed['host'] !== 'scorebar.vercel.app') {
            return new WP_Error(
                'invalid_callback',
                'Callback URL host is not permitted.',
                ['status' => 400],
            );
        }

        // ── 3. Store the token and mark as connected ───────────────────────
        // The token (key hash) is what the embed shortcode uses for the iframe
        // URL — identical to the embedToken returned by /api/plugin/verify.
        update_option('schedule_api_key', $token);
        update_option('schedule_embed_token', $token);
        set_transient('schedule_connection_status', [
            'ok'      => true,
            'message' => 'Connected via Setup Wizard',
        ], 0);    // TTL 0 = persistent until explicitly deleted

        // ── 4. Redirect back to Scorebar to finalise the handshake ─────────
        // wp_safe_redirect() only allows same-host redirects, so we set the
        // Location header directly after validating the host above.
        header('Location: ' . esc_url_raw($callback_url), true, 302);
        exit;
    }
}

// ── Force-clear update transients ─────────────────────────────────────────────
// Visit /wp-admin/plugins.php?force-update-check=1 to immediately discard the
// cached API response and make WordPress re-run the plugin update check.
// This is essential when:
//   - A new release was just pushed to GitHub and you don't want to wait an hour.
//   - Debugging whether the update endpoint returns the expected version.
add_action('admin_init', function () {
    if (
        isset($_GET['force-update-check']) &&
        current_user_can('manage_options')
    ) {
        // 1. Delete our own API-response cache (key: scorebar_update_check, TTL: 1 hour).
        //    Without this, the filter above just returns the stale cached version and
        //    never re-fetches from /api/plugin/update.
        delete_transient('scorebar_update_check');

        // 2. Delete WordPress's own plugin-update transient (TTL: 12 hours by default).
        //    Without this, WordPress won't re-run pre_set_site_transient_update_plugins
        //    even if our API would now return a newer version.
        delete_site_transient('update_plugins');

        // Redirect back to the plugins page without the query param so a page refresh
        // doesn't re-trigger the clear action.
        wp_safe_redirect(admin_url('plugins.php?update-check-cleared=1'));
        exit;
    }
});
