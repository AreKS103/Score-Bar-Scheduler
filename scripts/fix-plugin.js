const fs = require('fs');

const phpMain = `<?php
/**
 * Plugin Name: Scheduler
 * Plugin URI: https://scorebar.vercel.app/schedule
 * Description: A sports schedule widget for your website.
 * Version: 1.0.5
 * Author: Scorebar
 */
if (!defined('ABSPATH')) exit;

if (!defined('SCOREBAR_APP_PLUGIN_URL')) {
    define('SCOREBAR_APP_PLUGIN_URL', plugin_dir_url(__FILE__));
}
if (!defined('SCOREBAR_APP_VERCEL_DOMAIN')) {
    // Optional manual override from wp-config.php:
    // define('SCOREBAR_APP_BASE_URL', 'http://localhost:3000');
    if (defined('SCOREBAR_APP_BASE_URL') && SCOREBAR_APP_BASE_URL) {
        define('SCOREBAR_APP_VERCEL_DOMAIN', rtrim(SCOREBAR_APP_BASE_URL, '/'));
    } else {
        $home_url = function_exists('home_url') ? home_url() : '';
        $is_local = false;

        if (function_exists('wp_get_environment_type') && wp_get_environment_type() === 'local') {
            $is_local = true;
        }
        if (!$is_local && is_string($home_url)) {
            $is_local = strpos($home_url, 'localhost') !== false || strpos($home_url, '127.0.0.1') !== false || strpos($home_url, '.local') !== false;
        }

        define('SCOREBAR_APP_VERCEL_DOMAIN', $is_local ? 'http://localhost:3000' : 'https://scorebar.vercel.app');
    }
}

require_once plugin_dir_path(__FILE__) . 'includes/settings.php';
require_once plugin_dir_path(__FILE__) . 'includes/shortcode.php';
require_once plugin_dir_path(__FILE__) . 'includes/elementor-init.php';

if (!function_exists('scorebar_app_add_settings_link')) {
    function scorebar_app_add_settings_link($links) {
        $settings_link = '<a href="admin.php?page=scorebar-scheduler">Settings</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'scorebar_app_add_settings_link');
`;

const phpSettings = `<?php
if (!defined('ABSPATH')) exit;

if (!class_exists('Scorebar_Scheduler_App_Settings')) {
class Scorebar_Scheduler_App_Settings {
    public function __construct() {
        add_action('admin_menu', [$this, 'add_plugin_page']);
        add_action('admin_init', [$this, 'page_init']);
    }
    public function add_plugin_page() {
        add_menu_page('Scheduler', 'Scheduler', 'manage_options', 'scorebar-scheduler', [$this, 'create_admin_page'], 'dashicons-calendar-alt', 81);
    }
    public function page_init() {
        register_setting('scorebar_app_option_group', 'scorebar_app_api_key');
        add_settings_section('scorebar_app_setting_section', 'Connect Your Account', null, 'scorebar-scheduler');
        add_settings_field('scorebar_app_api_key', 'API Key', [$this, 'api_key_callback'], 'scorebar-scheduler', 'scorebar_app_setting_section');
    }
    public function api_key_callback() {
        $api_key = get_option('scorebar_app_api_key', '');
        echo '<input type="password" id="scorebar_app_api_key" name="scorebar_app_api_key" value="' . esc_attr($api_key) . '" style="width: 350px;" />';
        echo '<p class="description">Enter the API key generated from your dashboard.</p>';
    }
    public function create_admin_page() {
        $api_key = get_option('scorebar_app_api_key', '');
        $frontend_url = SCOREBAR_APP_VERCEL_DOMAIN;
        ?>
        <div class="wrap">
            <h1>Scheduler</h1>
            <?php if (!$api_key): ?>
                <div class="notice notice-info" style="padding: 20px; text-align: center; border-left-color: #2271b1; background: #fff; margin-bottom: 20px;">
                    <h2>Welcome to the Scheduler!</h2>
                    <p style="font-size: 16px;">To display your custom sports schedules on your WordPress site, you need to connect your account.</p>
                    <p><a href="<?php echo esc_url($frontend_url . '/login'); ?>" target="_blank" class="button button-primary button-hero">Login / Sign Up to get your API Key</a></p>
                    <p class="description">Once logged in, go to <strong>Settings</strong>, click <strong>Generate API Key</strong>, and paste it below.</p>
                </div>
            <?php else: ?>
                <div class="notice notice-success" style="padding: 10px 20px; background: #fff; border-left-color: #00a32a; margin-bottom: 20px;">
                    <h2 style="margin: 0 0 10px 0;">✅ Connected</h2>
                    <p style="margin: 0;">Your API key is saved. You can now use the <strong>Scheduler</strong> widget in Elementor, or use the shortcode <code>[scorebar_schedule]</code> directly.</p>
                </div>
            <?php endif; ?>
            <form method="post" action="options.php" style="background: #fff; padding: 20px; box-shadow: 0 1px 1px rgba(0,0,0,.04); max-width: 800px;">
                <?php settings_fields('scorebar_app_option_group'); do_settings_sections('scorebar-scheduler'); submit_button('Save API Key'); ?>
            </form>
        </div>
        <?php
    }
}
}

if (!function_exists('scorebar_app_init_settings')) {
    function scorebar_app_init_settings() {
        new Scorebar_Scheduler_App_Settings();
    }
}
add_action('plugins_loaded', 'scorebar_app_init_settings');
`;

const phpShortcode = `<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('scorebar_app_shortcode_render')) {
function scorebar_app_shortcode_render($atts) {
    if (!function_exists('get_option')) return '';
    $api_key = get_option('scorebar_app_api_key', '');
    if (empty($api_key)) { return '<p style="color:red; border:1px solid red; padding:10px;">Scheduler Error: API Key not configured in settings.</p>'; }
    
    $atts = shortcode_atts(['layout' => 'list', 'show_time' => '1', 'show_date' => '1', 'show_header' => '1', 'height' => '800px'], $atts, 'scorebar_schedule');
    $query_args = ['layout' => $atts['layout'], 'showTime' => $atts['show_time'], 'showDate' => $atts['show_date'], 'showHeader' => $atts['show_header']];
    $iframe_url = SCOREBAR_APP_VERCEL_DOMAIN . '/embed/' . sanitize_text_field($api_key) . '?' . http_build_query($query_args);
    $height = esc_attr($atts['height']);
    
    ob_start();
    ?>
    <div class="scorebar-schedule-wrapper" style="width: 100%; height: <?php echo $height; ?>; border: none; overflow: hidden; border-radius: 8px;">
        <iframe src="<?php echo esc_url($iframe_url); ?>" style="width: 100%; height: 100%; border: none; min-height: <?php echo $height; ?>" loading="lazy" allowtransparency="true"></iframe>
    </div>
    <?php
    return ob_get_clean();
}
}
add_shortcode('scorebar_schedule', 'scorebar_app_shortcode_render');
add_shortcode('score_schedule', 'scorebar_app_shortcode_render');
`;

const phpElementorInit = `<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('scorebar_app_register_elementor_categories')) {
function scorebar_app_register_elementor_categories($elements_manager) {
    $elements_manager->add_category('scorebar-schedule-category', ['title' => 'Scheduler', 'icon' => 'fa fa-calendar']);
}
}
add_action('elementor/elements/categories_registered', 'scorebar_app_register_elementor_categories');

if (!function_exists('scorebar_app_register_elementor_widgets')) {
function scorebar_app_register_elementor_widgets($widgets_manager) {
    if ( ! class_exists( '\\Elementor\\Widget_Base' ) ) return;
    require_once(__DIR__ . '/elementor-widget.php');
    if ( class_exists('\\Scorebar_App_Elementor_Widget') ) {
        $widgets_manager->register(new \\Scorebar_App_Elementor_Widget());
    }
}
}
add_action('elementor/widgets/register', 'scorebar_app_register_elementor_widgets');
`;

const phpElementorWidget = `<?php
if (!defined('ABSPATH')) exit;

if ( ! class_exists( '\\Elementor\\Widget_Base' ) ) return;

if (!class_exists('Scorebar_App_Elementor_Widget')) {
class Scorebar_App_Elementor_Widget extends \\Elementor\\Widget_Base {
    public function get_name() { return 'scorebar_schedule_widget'; }
    public function get_title() { return 'Scheduler'; }
    public function get_icon() { return 'eicon-calendar'; }
    public function get_categories() { return ['scorebar-schedule-category']; }
    public function get_keywords() { return ['schedule', 'score', 'sports', 'events', 'iframe']; }
    
    protected function register_controls() {
        if (!function_exists('get_option')) return;
        $api_key = get_option('scorebar_app_api_key', '');
        
        if (empty($api_key)) {
            $this->start_controls_section('error_section', ['label' => 'Content', 'tab' => \\Elementor\\Controls_Manager::TAB_CONTENT]);
            $this->add_control('error_message', ['type' => \\Elementor\\Controls_Manager::RAW_HTML, 'raw' => '<div style="color:red; padding:10px; border:1px solid red;">Please configure your Scheduler API Key in the WordPress Settings menu first.</div>']);
            $this->end_controls_section();
            return;
        }
        
        $this->start_controls_section('content_section', ['label' => 'Schedule Settings', 'tab' => \\Elementor\\Controls_Manager::TAB_CONTENT]);
        $this->add_control('layout', ['label' => 'Layout', 'type' => \\Elementor\\Controls_Manager::SELECT, 'default' => 'list', 'options' => ['list' => 'List View', 'grid' => 'Grid View']]);
        $this->add_control('show_header', ['label' => 'Show Header', 'type' => \\Elementor\\Controls_Manager::SWITCHER, 'label_on' => 'Yes', 'label_off' => 'No', 'return_value' => '1', 'default' => '1']);
        $this->add_control('show_date', ['label' => 'Show Date', 'type' => \\Elementor\\Controls_Manager::SWITCHER, 'label_on' => 'Yes', 'label_off' => 'No', 'return_value' => '1', 'default' => '1']);
        $this->add_control('show_time', ['label' => 'Show Time', 'type' => \\Elementor\\Controls_Manager::SWITCHER, 'label_on' => 'Yes', 'label_off' => 'No', 'return_value' => '1', 'default' => '1']);
        $this->add_responsive_control('iframe_height', ['label' => 'Height', 'type' => \\Elementor\\Controls_Manager::SLIDER, 'size_units' => ['px', 'vh'], 'range' => ['px' => ['min' => 200, 'max' => 2000]], 'default' => ['unit' => 'px', 'size' => 800], 'selectors' => ['{{WRAPPER}} .scorebar-schedule-wrapper' => 'height: {{SIZE}}{{UNIT}};', '{{WRAPPER}} .scorebar-schedule-wrapper iframe' => 'min-height: {{SIZE}}{{UNIT}};']]);
        $this->end_controls_section();
    }
    
    protected function render() {
        if (!function_exists('get_option')) return;
        $settings = $this->get_settings_for_display();
        $api_key = get_option('scorebar_app_api_key', '');
        
        if (empty($api_key)) { 
            echo '<p style="color:red; border:1px solid red; padding:10px;">Scheduler Error: API Key not configured in plugin settings.</p>'; 
            return; 
        }
        
        $query_args = ['layout' => $settings['layout'] ?? 'list', 'showTime' => $settings['show_time'] ?? '1', 'showDate' => $settings['show_date'] ?? '1', 'showHeader' => $settings['show_header'] ?? '1'];
        $iframe_url = SCOREBAR_APP_VERCEL_DOMAIN . '/embed/' . sanitize_text_field($api_key) . '?' . http_build_query($query_args);
        ?>
        <div class="scorebar-schedule-wrapper" style="width: 100%; border: none; overflow: hidden; border-radius: 8px;">
            <iframe src="<?php echo esc_url($iframe_url); ?>" style="width: 100%; height: 100%; border: none; min-height: <?php echo $settings['iframe_height']['size'] ?? 800; ?>px" loading="lazy" allowtransparency="true"></iframe>
        </div>
        <?php
    }
}
}
`;

fs.mkdirSync('wordpress-plugin/includes', { recursive: true });
fs.writeFileSync('wordpress-plugin/scorebar-scheduler.php', phpMain);
fs.writeFileSync('wordpress-plugin/includes/settings.php', phpSettings);
fs.writeFileSync('wordpress-plugin/includes/shortcode.php', phpShortcode);
fs.writeFileSync('wordpress-plugin/includes/elementor-init.php', phpElementorInit);
fs.writeFileSync('wordpress-plugin/includes/elementor-widget.php', phpElementorWidget);

console.log('Plugin files correctly generated.');
