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
        if (empty(schedule_get_app_domain())) {
            add_settings_error('schedule_api_key', 'no_app_url', 'Please enter the App URL first, then save the API key.', 'error');
            return $input;
        }
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
        if (empty(schedule_get_app_domain())) {
            wp_send_json_error('App URL is not configured. Go to Settings > Scheduler to set it.');
        }

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
                // Save App URL (advanced)
                $new_app_url = isset($_POST['schedule_app_url']) ? trim(wp_unslash($_POST['schedule_app_url'])) : '';
                if (!empty($new_app_url)) {
                    $new_app_url = esc_url_raw($new_app_url);
                    if (preg_match('#^https?://#', $new_app_url)) {
                        update_option('schedule_app_url', rtrim($new_app_url, '/'));
                    }
                } else {
                    delete_option('schedule_app_url');
                }
                $saved_ok = true;
            } else {
                $saved_ok = false;
            }
        }

        $api_key    = get_option('schedule_api_key', '');
        $status     = get_transient('schedule_connection_status');
        $is_connected = is_array($status) && !empty($status['ok']);
        $frontend_url = schedule_get_app_domain();
        $verify_url   = rtrim(schedule_get_app_domain(), '/') . '/api/plugin/verify';
        ?>
        <div class="wrap">
            <h1>Scheduler</h1>

            <?php if (!$api_key): ?>
                <?php if (empty($frontend_url)): ?>
                <div class="notice notice-warning" style="padding: 20px; border-left-color: #dba617; background: #fff; margin-bottom: 20px;">
                    <h2>Welcome to the Scheduler!</h2>
                    <p style="font-size: 15px;">Enter your <strong>App URL</strong> below to get started, then save your API key.</p>
                </div>
                <?php else: ?>
                <div class="notice notice-info" style="padding: 20px; text-align: center; border-left-color: #2271b1; background: #fff; margin-bottom: 20px;">
                    <h2>Welcome to the Scheduler!</h2>
                    <p style="font-size: 16px;">To display your custom sports schedules on your WordPress site, you need to connect your account.</p>
                    <ol style="text-align: left; max-width: 480px; margin: 16px auto; line-height: 1.8;">
                        <li><a href="<?php echo esc_url($frontend_url . '/login'); ?>" target="_blank">Login or create an account</a> on the Scheduler dashboard.</li>
                        <li>Open <strong>Settings</strong> (gear icon) and click <strong>Generate API Key</strong>.</li>
                        <li>Copy the key and paste it below, then click <strong>Save API Key</strong>.</li>
                    </ol>
                    <p><a href="<?php echo esc_url($frontend_url . '/login'); ?>" target="_blank" class="button button-primary button-hero">Go to Dashboard</a></p>
                </div>
                <?php endif; ?>
            <?php else: ?>
                <?php if ($is_connected): ?>
                    <div class="notice notice-success" style="padding: 10px 20px; background: #fff; border-left-color: #00a32a; margin-bottom: 20px;">
                        <h2 style="margin: 0 0 10px 0;">&#9989; Connected</h2>
                        <p style="margin: 0;">Your account is linked. Use the <strong>Scheduler</strong> Elementor widget or the shortcode <code>[schedule]</code> to display your schedule.</p>
                        <p style="margin-top: 8px;"><button type="button" class="button" id="schedule-refresh-token-btn">Refresh Token</button> <span id="schedule-refresh-result" style="margin-left: 8px;"></span></p>
                    </div>
                <?php else: ?>
                    <div class="notice notice-warning" style="padding: 10px 20px; background: #fff; border-left-color: #dba617; margin-bottom: 20px;">
                        <h2 style="margin: 0 0 10px 0;">&#9888;&#65039; Not Verified</h2>
                        <p style="margin: 0;">
                            An API key is saved but the connection has not been verified.
                            <?php if (is_array($status) && !empty($status['message'])): ?>
                                <br /><strong>Last error:</strong> <?php echo esc_html($status['message']); ?>
                            <?php endif; ?>
                        </p>
                        <p style="margin-top: 8px;"><button type="button" class="button" id="schedule-test-btn">Test Connection</button> <span id="schedule-test-result" style="margin-left: 8px;"></span></p>
                    </div>
                <?php endif; ?>
            <?php endif; ?>

            <form method="post" action="" style="background: #fff; padding: 20px; box-shadow: 0 1px 1px rgba(0,0,0,.04); max-width: 800px;">
                <?php wp_nonce_field('schedule_save_key', 'schedule_save_key_nonce'); ?>
                <?php if ($saved_ok === false): ?>
                    <div class="notice notice-error inline"><p>Security verification failed. Please refresh and try again.</p></div>
                <?php endif; ?>
                <h2 style="margin-top:0">Connect Your Account</h2>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row"><label for="schedule_api_key">API Key</label></th>
                            <td><?php $this->api_key_callback(); ?></td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="schedule_app_url">App URL <small>(advanced)</small></label></th>
                            <td>
                                <input type="url" id="schedule_app_url" name="schedule_app_url" value="<?php echo esc_attr(get_option('schedule_app_url', '')); ?>" style="width: 350px;" placeholder="https://your-app-domain.com" />
                                <p class="description">Leave blank to use the default. Only change this if you are self-hosting the Scheduler app on your own domain.</p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button('Save API Key'); ?>
            </form>

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
