<?php
if (!defined('ABSPATH')) exit;

if ( ! class_exists( '\Elementor\Widget_Base' ) ) {
    return;
}

if (!class_exists('Schedule_Elementor_Banner_Widget')) {
class Schedule_Elementor_Banner_Widget extends \Elementor\Widget_Base {
    public function get_name() { return 'schedule_banner_widget'; }
    public function get_title() { return 'Scheduler Banner'; }
    public function get_icon() { return 'eicon-alert'; }
    public function get_categories() { return ['schedule-category']; }
    public function get_keywords() { return ['schedule', 'score', 'sports', 'banner', 'announcement', 'promo']; }

    protected function register_controls() {
        if (!function_exists('schedule_banner_defaults')) return;
        $d = schedule_banner_defaults();

        $this->start_controls_section('banner_content', [
            'label' => 'Banner Content',
            'tab' => \Elementor\Controls_Manager::TAB_CONTENT,
        ]);
        $this->add_control('enabled', [
            'label' => 'Show Banner',
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'label_on' => 'On',
            'label_off' => 'Off',
            'return_value' => '1',
            'default' => '1',
        ]);
        $embed_options = function_exists('schedule_get_embed_instance_options')
            ? schedule_get_embed_instance_options('Choose a schedule embed')
            : ['' => 'Choose a schedule embed'];
        $this->add_control('embed_id', [
            'label' => 'Schedule Embed',
            'type' => \Elementor\Controls_Manager::SELECT,
            'default' => '',
            'options' => $embed_options,
            'description' => 'Choose the same schedule embed you publish to in the Scheduler app.',
        ]);
        $this->add_control('prefix', [
            'label' => 'Prefix Text',
            'type' => \Elementor\Controls_Manager::TEXT,
            'default' => $d['prefix'],
            'placeholder' => $d['prefix'],
        ]);
        $this->add_control('fallback_text', [
            'label' => 'Fallback Text',
            'type' => \Elementor\Controls_Manager::TEXT,
            'default' => $d['fallback_text'],
            'placeholder' => $d['fallback_text'],
            'description' => 'Shown when this schedule has no highlighted matches yet.',
        ]);
        $this->add_control('link_url', [
            'label' => 'Banner Link',
            'type' => \Elementor\Controls_Manager::URL,
            'placeholder' => 'https://example.com/schedule',
            'options' => ['url', 'is_external', 'nofollow'],
            'default' => ['url' => ''],
        ]);
        $this->end_controls_section();

        $this->start_controls_section('banner_behavior', [
            'label' => 'Display',
            'tab' => \Elementor\Controls_Manager::TAB_CONTENT,
        ]);
        $this->add_control('animation', [
            'label' => 'Animation',
            'type' => \Elementor\Controls_Manager::SELECT,
            'default' => $d['animation'],
            'options' => [
                'slide' => 'Slide',
                'fade' => 'Fade',
            ],
        ]);
        $this->add_control('interval', [
            'label' => 'Speed',
            'type' => \Elementor\Controls_Manager::SLIDER,
            'size_units' => ['s'],
            'range' => ['s' => ['min' => 2, 'max' => 30, 'step' => 1]],
            'default' => ['unit' => 's', 'size' => $d['interval']],
        ]);
        $this->add_control('position', [
            'label' => 'Position',
            'type' => \Elementor\Controls_Manager::SELECT,
            'default' => 'static',
            'options' => [
                'static' => 'Normal - place above header',
                'fixed' => 'Sticky top while scrolling',
            ],
        ]);
        $this->add_control('uppercase', [
            'label' => 'Uppercase Text',
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'label_on' => 'On',
            'label_off' => 'Off',
            'return_value' => '1',
            'default' => (string) $d['uppercase'],
        ]);
        $this->add_control('show_time', [
            'label' => 'Show Time',
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'label_on' => 'Show',
            'label_off' => 'Hide',
            'return_value' => '1',
            'default' => (string) $d['show_time'],
        ]);
        $this->add_control('show_logos', [
            'label' => 'Show League Logo',
            'type' => \Elementor\Controls_Manager::SWITCHER,
            'label_on' => 'Show',
            'label_off' => 'Hide',
            'return_value' => '1',
            'default' => '',
        ]);
        $this->end_controls_section();

        $this->start_controls_section('banner_style', [
            'label' => 'Style',
            'tab' => \Elementor\Controls_Manager::TAB_STYLE,
        ]);
        $this->add_control('bg_color', [
            'label' => 'Background',
            'type' => \Elementor\Controls_Manager::COLOR,
            'default' => $d['bg_color'],
        ]);
        $this->add_control('text_color', [
            'label' => 'Text',
            'type' => \Elementor\Controls_Manager::COLOR,
            'default' => $d['text_color'],
        ]);
        $this->add_control('accent_color', [
            'label' => 'Accent Text',
            'type' => \Elementor\Controls_Manager::COLOR,
            'default' => $d['accent_color'],
        ]);
        $this->add_control('font_size', [
            'label' => 'Text Size',
            'type' => \Elementor\Controls_Manager::SLIDER,
            'size_units' => ['px'],
            'range' => ['px' => ['min' => 10, 'max' => 40, 'step' => 1]],
            'default' => ['unit' => 'px', 'size' => $d['font_size']],
        ]);
        $this->end_controls_section();
    }

    private function is_edit_mode() {
        return class_exists('\\Elementor\\Plugin') && \Elementor\Plugin::$instance->editor->is_edit_mode();
    }

    private function render_notice($message) {
        if (!$this->is_edit_mode()) return;
        echo '<div style="border:1px dashed #94a3b8;background:#f8fafc;color:#334155;padding:12px 14px;border-radius:6px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;font-size:13px;">' . esc_html($message) . '</div>';
    }

    private function render_editor_fallback($target_id, $prefix, $show_time) {
        if (!$this->is_edit_mode()) return;
        $sample = '<div class="sb-inner"><div class="sb-prefix">' . esc_html($prefix) . '</div><div class="sb-track"><div class="sb-slide sb-active" style="position:relative;opacity:1;pointer-events:auto;transform:none">' . ($show_time ? '<span class="sb-time">8:00 PM</span><span class="sb-separator">·</span>' : '') . '<span class="sb-sport">MLB:</span><span class="sb-matchup">Jays vs Baltimore</span></div></div></div>';
        ?>
        <script>
        (function(){
            var id = '<?php echo esc_js($target_id); ?>';
            var html = <?php echo wp_json_encode($sample); ?>;
            setTimeout(function(){
                var el = document.getElementById(id);
                if (!el || el.classList.contains('sb-ready')) return;
                el.innerHTML = html;
                el.classList.add('sb-ready');
            }, 900);
        })();
        </script>
        <?php
    }

    protected function render() {
        if (!function_exists('schedule_banner_defaults') || !function_exists('schedule_banner_render_instance')) return;

        $settings = $this->get_settings_for_display();
        if (empty($settings['enabled'])) {
            $this->render_notice('Scheduler Banner is turned off.');
            return;
        }

        $link_url = '';
        if (isset($settings['link_url']) && is_array($settings['link_url']) && !empty($settings['link_url']['url'])) {
            $link_url = $settings['link_url']['url'];
        }

        $banner_settings = schedule_banner_sanitize([
            'enabled'      => 1,
            'embed_id'     => $settings['embed_id'] ?? '',
            'prefix'       => $settings['prefix'] ?? '',
            'fallback_text'=> $settings['fallback_text'] ?? '',
            'bg_color'     => $settings['bg_color'] ?? '',
            'text_color'   => $settings['text_color'] ?? '',
            'accent_color' => $settings['accent_color'] ?? '',
            'font_size'    => $settings['font_size']['size'] ?? '',
            'interval'     => $settings['interval']['size'] ?? '',
            'animation'    => $settings['animation'] ?? '',
            'position'     => $settings['position'] ?? '',
            'uppercase'    => !empty($settings['uppercase']) ? 1 : 0,
            'show_time'    => !empty($settings['show_time']) ? 1 : 0,
            'show_logos'   => !empty($settings['show_logos']) ? 1 : 0,
            'link_url'     => $link_url,
        ]);

        if (empty($banner_settings['embed_id']) && empty($banner_settings['fallback_text'])) {
            $this->render_notice('Choose a Schedule Embed ID or add fallback text for this banner.');
            return;
        }

        if (empty(schedule_banner_get_public_key()) && empty($banner_settings['fallback_text'])) {
            $this->render_notice('Connect Scheduler in WordPress admin before this banner can load highlights.');
            return;
        }

        $target_id = schedule_banner_safe_target_id('sb-banner-el-' . $this->get_id(), 'sb-banner-el');
        schedule_banner_render_instance($banner_settings, $target_id);
        schedule_banner_enqueue_instance($banner_settings, $target_id);
        $this->render_editor_fallback($target_id, $banner_settings['prefix'], !empty($banner_settings['show_time']));
    }
}
}
