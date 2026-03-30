<?php
if (!defined('ABSPATH')) exit;

if (!class_exists('Schedule_Settings')) {
class Schedule_Settings {
    public function __construct() {
        add_action('admin_menu', [$this, 'add_plugin_page']);
        add_action('admin_init', [$this, 'page_init']);
        add_action('wp_ajax_schedule_test_connection', [$this, 'ajax_test_connection']);
    }

    public function add_plugin_page() {
        add_menu_page('Scheduler', 'Scheduler', 'manage_options', 'scheduler-settings', [$this, 'create_admin_page'], 'dashicons-calendar-alt', 81);
    }

    public function page_init() {
        register_setting('schedule_option_group', 'schedule_api_key', [
            'sanitize_callback' => [$this, 'sanitize_and_verify_key'],
        ]);
        add_settings_section('schedule_setting_section', 'Connect Your Account', null, 'scheduler-settings');
        add_settings_field('schedule_api_key', 'API Key', [$this, 'api_key_callback'], 'scheduler-settings', 'schedule_setting_section');
    }

    /**
     * When the user saves the API key, call our verify endpoint to establish the link.
     */
    public function sanitize_and_verify_key($input) {
        $input = sanitize_text_field(trim($input));
        if (empty($input)) {
            delete_transient('schedule_connection_status');
            return $input;
        }

        $verify_url = rtrim(schedule_get_app_domain(), '/') . '/api/plugin/verify';
        $site_url = home_url();

        $response = wp_remote_post($verify_url, [
            'timeout' => 15,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode([
                'apiKey'  => $input,
                'siteUrl' => $site_url,
            ]),
        ]);

        if (is_wp_error($response)) {
            set_transient('schedule_connection_status', [
                'ok'      => false,
                'message' => 'Could not reach the server: ' . $response->get_error_message(),
            ], 300);
            return $input;
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code === 200 && !empty($body['ok'])) {
            set_transient('schedule_connection_status', [
                'ok'      => true,
                'message' => $body['message'] ?? 'Connected successfully',
            ], 0);
            if (!empty($body['embedToken'])) {
                update_option('schedule_embed_token', sanitize_text_field($body['embedToken']));
            }
        } else {
            $err = $body['error'] ?? 'Unknown error (HTTP ' . $code . ')';
            set_transient('schedule_connection_status', [
                'ok'      => false,
                'message' => $err,
            ], 300);
        }

        return $input;
    }

    /**
     * AJAX handler: test connection without re-saving the key.
     */
    public function ajax_test_connection() {
        check_ajax_referer('schedule_test_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        $api_key = get_option('schedule_api_key', '');
        if (empty($api_key)) {
            wp_send_json_error('No API key configured.');
        }

        $verify_url = rtrim(schedule_get_app_domain(), '/') . '/api/plugin/verify';

        $response = wp_remote_post($verify_url, [
            'timeout' => 15,
            'headers' => ['Content-Type' => 'application/json'],
            'body'    => wp_json_encode([
                'apiKey'  => $api_key,
                'siteUrl' => home_url(),
            ]),
        ]);

        if (is_wp_error($response)) {
            $err_msg = $response->get_error_message();
            set_transient('schedule_connection_status', ['ok' => false, 'message' => $err_msg], 300);
            wp_send_json_error('Cannot reach server at ' . esc_url($verify_url) . ' — ' . $err_msg);
        }

        $code = wp_remote_retrieve_response_code($response);
        $body = json_decode(wp_remote_retrieve_body($response), true);

        if ($code === 200 && !empty($body['ok'])) {
            set_transient('schedule_connection_status', ['ok' => true, 'message' => 'Connected'], 0);
            if (!empty($body['embedToken'])) {
                update_option('schedule_embed_token', sanitize_text_field($body['embedToken']));
            }
            wp_send_json_success('✅ Connection verified!');
        } else {
            $err = $body['error'] ?? 'HTTP ' . $code;
            set_transient('schedule_connection_status', ['ok' => false, 'message' => $err], 300);
            wp_send_json_error('Server returned: ' . $err . ' (HTTP ' . $code . ')');
        }
    }

    public function api_key_callback() {
        $api_key = get_option('schedule_api_key', '');
        echo '<input type="password" id="schedule_api_key" name="schedule_api_key" value="' . esc_attr($api_key) . '" style="width: 350px;" />';
        echo '<p class="description">Paste the API key from your Scheduler dashboard Settings.</p>';
    }

    public function create_admin_page() {
        // Hard capability guard — works even when security plugins interfere with options.php
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have sufficient permissions to access this page.'));
        }

        // Handle form submission directly, bypassing options.php entirely.
        // This avoids "not allowed" errors caused by security plugins or
        // non-standard user-role configurations on production sites.
        $saved_ok = null;
        if ('POST' === $_SERVER['REQUEST_METHOD'] && isset($_POST['schedule_save_key_nonce'])) {
            if (wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['schedule_save_key_nonce'])), 'schedule_save_key')) {
                $new_key = sanitize_text_field(trim(wp_unslash($_POST['schedule_api_key'] ?? '')));
                update_option('schedule_api_key', $this->sanitize_and_verify_key($new_key));
                $saved_ok = true;
            } else {
                $saved_ok = false;
            }
        }

        $api_key    = get_option('schedule_api_key', '');
        $status     = get_transient('schedule_connection_status');
        $is_connected = is_array($status) && !empty($status['ok']);
        $frontend_url = schedule_get_app_domain();
        $wizard_url   = $frontend_url . '/onboarding/connect';
        ?>
        <div class="wrap" style="max-width: 600px;">
            <h1 style="margin-bottom: 16px;">Scheduler</h1>

            <?php if (!$api_key): ?>
                <div style="background: #fff; border: 1px solid #c3c4c7; border-left: 4px solid #2271b1; padding: 24px 28px; margin-bottom: 20px; border-radius: 2px;">
                    <h2 style="margin: 0 0 8px 0; font-size: 18px;">Welcome!</h2>
                    <p style="margin: 0 0 16px 0; color: #50575e;">Connect your site in seconds using the setup wizard.</p>
                    <a href="<?php echo esc_url($wizard_url); ?>" target="_blank" class="button button-primary button-hero" style="font-size: 15px;">Open Setup Wizard</a>
                </div>

                <details style="background: #fff; border: 1px solid #c3c4c7; padding: 16px 20px; border-radius: 2px;">
                    <summary style="cursor: pointer; font-weight: 600; color: #1d2327;">Or connect manually with an API key</summary>
                    <form method="post" action="" style="margin-top: 12px;">
                        <?php wp_nonce_field('schedule_save_key', 'schedule_save_key_nonce'); ?>
                        <label for="schedule_api_key" style="display: block; margin-bottom: 6px; font-weight: 500;">API Key</label>
                        <input type="password" id="schedule_api_key" name="schedule_api_key" value="" style="width: 100%; max-width: 350px;" />
                        <p class="description">Paste the API key from your <a href="<?php echo esc_url($frontend_url . '/schedule'); ?>" target="_blank">dashboard settings</a>.</p>
                        <?php submit_button('Save API Key'); ?>
                    </form>
                </details>

            <?php elseif ($is_connected): ?>
                <div style="background: #fff; border: 1px solid #c3c4c7; border-left: 4px solid #00a32a; padding: 20px 24px; margin-bottom: 20px; border-radius: 2px;">
                    <h2 style="margin: 0 0 6px 0; font-size: 16px;">&#9989; Connected</h2>
                    <p style="margin: 0 0 12px 0; color: #50575e;">Use the <code>[schedule]</code> shortcode or the <strong>Scheduler</strong> Elementor widget to display your schedule.</p>
                    <button type="button" class="button" id="schedule-refresh-token-btn">Refresh Token</button>
                    <span id="schedule-refresh-result" style="margin-left: 8px;"></span>
                </div>

                <details style="background: #fff; border: 1px solid #c3c4c7; padding: 16px 20px; border-radius: 2px;">
                    <summary style="cursor: pointer; font-weight: 600; color: #1d2327;">Update API Key</summary>
                    <form method="post" action="" style="margin-top: 12px;">
                        <?php wp_nonce_field('schedule_save_key', 'schedule_save_key_nonce'); ?>
                        <label for="schedule_api_key" style="display: block; margin-bottom: 6px; font-weight: 500;">API Key</label>
                        <input type="password" id="schedule_api_key" name="schedule_api_key" value="<?php echo esc_attr($api_key); ?>" style="width: 100%; max-width: 350px;" />
                        <?php submit_button('Save API Key'); ?>
                    </form>
                </details>

            <?php else: ?>
                <div style="background: #fff; border: 1px solid #c3c4c7; border-left: 4px solid #dba617; padding: 20px 24px; margin-bottom: 20px; border-radius: 2px;">
                    <h2 style="margin: 0 0 6px 0; font-size: 16px;">&#9888;&#65039; Not Verified</h2>
                    <p style="margin: 0 0 4px 0; color: #50575e;">An API key is saved but the connection hasn't been verified.</p>
                    <?php if (is_array($status) && !empty($status['message'])): ?>
                        <p style="margin: 0 0 12px 0; color: #d63638; font-size: 13px;"><?php echo esc_html($status['message']); ?></p>
                    <?php endif; ?>
                    <button type="button" class="button" id="schedule-test-btn">Test Connection</button>
                    <span id="schedule-test-result" style="margin-left: 8px;"></span>
                </div>

                <form method="post" action="" style="background: #fff; border: 1px solid #c3c4c7; padding: 16px 20px; border-radius: 2px;">
                    <?php wp_nonce_field('schedule_save_key', 'schedule_save_key_nonce'); ?>
                    <?php if ($saved_ok === false): ?>
                        <div class="notice notice-error inline"><p>Security verification failed. Please refresh and try again.</p></div>
                    <?php endif; ?>
                    <label for="schedule_api_key" style="display: block; margin-bottom: 6px; font-weight: 500;">API Key</label>
                    <input type="password" id="schedule_api_key" name="schedule_api_key" value="<?php echo esc_attr($api_key); ?>" style="width: 100%; max-width: 350px;" />
                    <p class="description">Paste a new key or <a href="<?php echo esc_url($wizard_url); ?>" target="_blank">re-run the setup wizard</a>.</p>
                    <?php submit_button('Save API Key'); ?>
                </form>
            <?php endif; ?>

            <?php if ($api_key): ?>
            <script>
            (function(){
                var btn = document.getElementById('schedule-test-btn');
                var result = document.getElementById('schedule-test-result');
                if (!btn) return;
                btn.addEventListener('click', function() {
                    btn.disabled = true;
                    result.textContent = '⏳ Testing...';
                    result.style.color = '#666';
                    var data = new FormData();
                    data.append('action', 'schedule_test_connection');
                    data.append('nonce', '<?php echo esc_js(wp_create_nonce('schedule_test_nonce')); ?>');
                    fetch(ajaxurl, { method: 'POST', body: data })
                        .then(function(r) { return r.json(); })
                        .then(function(json) {
                            if (json.success) {
                                result.textContent = json.data;
                                result.style.color = '#00a32a';
                            } else {
                                result.textContent = '❌ ' + (json.data || 'Failed');
                                result.style.color = '#d63638';
                            }
                        })
                        .catch(function(e) {
                            result.textContent = '❌ JS fetch error: ' + (e && e.message ? e.message : 'unknown');
                            result.style.color = '#d63638';
                        })
                        .finally(function() { btn.disabled = false; });
                });
            })();
            (function(){
                var rbtn = document.getElementById('schedule-refresh-token-btn');
                var rres = document.getElementById('schedule-refresh-result');
                if (!rbtn) return;
                rbtn.addEventListener('click', function() {
                    rbtn.disabled = true;
                    rres.textContent = '⏳ Refreshing token…';
                    rres.style.color = '#666';
                    var data = new FormData();
                    data.append('action', 'schedule_test_connection');
                    data.append('nonce', '<?php echo esc_js(wp_create_nonce("schedule_test_nonce")); ?>');
                    fetch(ajaxurl, { method: 'POST', body: data })
                        .then(function(r) { return r.json(); })
                        .then(function(json) {
                            if (json.success) {
                                rres.textContent = '✅ Token refreshed';
                                rres.style.color = '#00a32a';
                            } else {
                                rres.textContent = '❌ ' + (json.data || 'Failed');
                                rres.style.color = '#d63638';
                            }
                        })
                        .catch(function(e) {
                            rres.textContent = '❌ ' + (e && e.message ? e.message : 'unknown');
                            rres.style.color = '#d63638';
                        })
                        .finally(function() { rbtn.disabled = false; });
                });
            })();
            </script>
            <?php endif; ?>
        </div>
        <?php
    }
}
}

if (!function_exists('schedule_plugin_init')) {
    function schedule_plugin_init() {
        new Schedule_Settings();
    }
}
add_action('plugins_loaded', 'schedule_plugin_init');
