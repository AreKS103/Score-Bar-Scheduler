<?php
if (!defined('ABSPATH')) exit;

if ( ! class_exists( '\Elementor\Widget_Base' ) ) {
    return;
}

if (!class_exists('Schedule_Elementor_Widget')) {
class Schedule_Elementor_Widget extends \Elementor\Widget_Base {
    public function get_name() { return 'schedule_widget'; }
    public function get_title() { return 'Scheduler'; }
    public function get_icon() { return 'eicon-calendar'; }
    public function get_categories() { return ['schedule-category']; }
    public function get_keywords() { return ['schedule', 'score', 'sports', 'events', 'iframe']; }
    
    protected function register_controls() {
        if (!function_exists('get_option')) return;
        $api_key = get_option('schedule_api_key', '');
        
        if (empty($api_key)) {
            $this->start_controls_section('error_section', ['label' => 'Content', 'tab' => \Elementor\Controls_Manager::TAB_CONTENT]);
            $this->add_control('error_message', ['type' => \Elementor\Controls_Manager::RAW_HTML, 'raw' => '<div style="color:red; padding:10px; border:1px solid red;">Please configure your Scheduler API Key in the WordPress Settings menu first.</div>']);
            $this->end_controls_section();
            return;
        }
        
        // ── Display Settings ────────────────────────────────────────────────
        $this->start_controls_section('content_section', ['label' => 'Display Settings', 'tab' => \Elementor\Controls_Manager::TAB_CONTENT]);
        $this->add_control('embed_id', ['label' => 'Element ID (optional)', 'type' => \Elementor\Controls_Manager::TEXT, 'default' => '', 'placeholder' => 'e.g. sidebar, homepage, footer', 'description' => 'Unique name for this embed instance. Shown in your Scheduler dashboard. Leave blank for auto-numbering.']);
        $this->add_control('list_style', ['label' => 'Schedule View', 'type' => \Elementor\Controls_Manager::SELECT, 'default' => 'default', 'options' => ['default' => 'Default List', 'card' => 'Card Style', 'calendar' => 'Calendar Grid'], 'description' => 'Calendar Grid shows a full weekly view.']);
        $this->add_control('show_sport_tabs', ['label' => 'Sport Filter Tabs',    'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'Show', 'label_off' => 'Hide', 'return_value' => '1', 'default' => '1']);
        $this->add_control('show_header',     ['label' => 'Category Headings',    'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'Show', 'label_off' => 'Hide', 'return_value' => '1', 'default' => '1']);
        $this->add_control('show_date',       ['label' => 'Date Rows',            'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'Show', 'label_off' => 'Hide', 'return_value' => '1', 'default' => '1']);
        $this->add_control('show_time',       ['label' => 'Match Time',           'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'Show', 'label_off' => 'Hide', 'return_value' => '1', 'default' => '1']);
        $this->add_control('auto_height', ['label' => 'Auto Height (fit content)', 'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'On', 'label_off' => 'Off', 'return_value' => '1', 'default' => '1', 'description' => 'Expands to show all matches with no scrollbar']);
        $this->add_control('show_view_toggle', ['label' => 'View Toggle Button', 'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'Show', 'label_off' => 'Hide', 'return_value' => '1', 'default' => '1', 'description' => 'Show/hide the List ↔ Calendar toggle button.']);
        $this->add_responsive_control('iframe_height', ['label' => 'Fixed Height (Auto off only)', 'type' => \Elementor\Controls_Manager::SLIDER, 'size_units' => ['px', 'vh'], 'range' => ['px' => ['min' => 200, 'max' => 3000], 'vh' => ['min' => 10, 'max' => 100]], 'default' => ['unit' => 'px', 'size' => 600]]);
        $this->end_controls_section();

        // ── Style & Theme ────────────────────────────────────────────────────
        $this->start_controls_section('style_section', ['label' => 'Style & Theme', 'tab' => \Elementor\Controls_Manager::TAB_CONTENT]);
        $this->add_control('theme',       ['label' => 'Color Theme',      'type' => \Elementor\Controls_Manager::SELECT,  'default' => 'light',  'options' => ['light' => 'Light', 'dark' => 'Dark', 'auto' => 'Auto (System)']]);
        $this->add_control('accent_color',['label' => 'Accent Color',     'type' => \Elementor\Controls_Manager::COLOR,   'default' => '#4b5563']);
        $this->add_control('bg_color',    ['label' => 'Background Color',  'type' => \Elementor\Controls_Manager::COLOR,   'default' => '', 'description' => 'Leave empty for theme default']);
        $this->add_control('text_color',  ['label' => 'Text Color',        'type' => \Elementor\Controls_Manager::COLOR,   'default' => '', 'description' => 'Leave empty for theme default']);
        $this->add_control('font',        ['label' => 'Font Style',       'type' => \Elementor\Controls_Manager::SELECT,  'default' => 'system', 'options' => ['system' => 'System', 'serif' => 'Serif', 'mono' => 'Monospace']]);
        $this->add_control('match_font_size', ['label' => 'Match Text Size (px)', 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 14, 'min' => 6, 'max' => 120, 'step' => 1, 'render_type' => 'template', 'description' => 'Font size for match lines in pixels']);
        $this->add_control('time_font_size',  ['label' => 'Time Text Size (px)',   'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 11, 'min' => 6, 'max' => 120, 'step' => 1, 'render_type' => 'template', 'description' => 'Font size for the match kick-off time']);
        $this->add_control('date_font_size',  ['label' => 'Date Label Size (px)',  'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 11, 'min' => 6, 'max' => 120, 'step' => 1, 'render_type' => 'template']);
        $this->add_control('header_size', ['label' => 'League Name Size (px)', 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 16, 'min' => 6, 'max' => 120, 'step' => 1, 'render_type' => 'template']);
        $this->add_control('highlight_font_size', ['label' => 'Highlight Text Size (px)', 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 18, 'min' => 6, 'max' => 120, 'step' => 1, 'render_type' => 'template', 'description' => 'Font size for team names in the highlights section']);
        $this->add_control('logo_size',   ['label' => 'League Logo Size', 'type' => \Elementor\Controls_Manager::SELECT, 'default' => 'md', 'options' => ['sm' => 'Small', 'md' => 'Medium', 'lg' => 'Large']]);
        $this->add_control('line_height', ['label' => 'Line Spacing', 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => '1.6', 'min' => 0.8, 'max' => 4, 'step' => 0.1, 'render_type' => 'template', 'description' => 'Line height multiplier (e.g. 1.6 = normal, 1.2 = tight, 2.0 = double)']);
        $this->add_control('hide_logos',  ['label' => 'Hide Logos',       'type' => \Elementor\Controls_Manager::SWITCHER,'label_on' => 'Yes', 'label_off' => 'No', 'return_value' => '1', 'default' => '']);
        $this->add_control('no_copy',     ['label' => 'Block Right-Click & Copy', 'type' => \Elementor\Controls_Manager::SWITCHER, 'label_on' => 'On', 'label_off' => 'Off', 'return_value' => '1', 'default' => '', 'description' => 'Prevents visitors from right-clicking or copying widget content (pairs with WP Content Copy Protection plugin)']);
        $this->add_control('padding',     ['label' => 'Content Padding (px)', 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 12, 'min' => 0, 'max' => 80, 'step' => 1, 'render_type' => 'template', 'description' => 'Inner padding in pixels']);
        $this->add_control('tab_style',   ['label' => 'Tab Style',        'type' => \Elementor\Controls_Manager::SELECT,  'default' => 'pill', 'options' => ['pill' => 'Pill', 'underline' => 'Underline', 'square' => 'Square']]);
        $this->end_controls_section();
    }
    
    protected function render() {
        if (!function_exists('get_option')) return;
        $settings = $this->get_settings_for_display();
        $api_key = get_option('schedule_api_key', '');
        
        if (empty($api_key)) { 
            echo '<p style="color:red; border:1px solid red; padding:10px;">Scheduler Error: API Key not configured in plugin settings.</p>'; 
            return; 
        }
        // Use the public embed token in the iframe URL — it is a one-way hash and
        // cannot be used to access the account. Fall back to raw key for legacy installs.
        $embed_token = get_option('schedule_embed_token', '');
        $iframe_key  = !empty($embed_token) ? $embed_token : $api_key;
        
        $accent_hex  = ltrim($settings['accent_color'] ?? '#3b82f6', '#');
        $bg_hex      = ltrim($settings['bg_color'] ?? '', '#');
        $text_hex    = ltrim($settings['text_color'] ?? '', '#');
        $auto_height = !empty($settings['auto_height']);
        $widget_id   = $this->get_id();
        $query_args = [
            'showTime'      => !empty($settings['show_time'])        ? '1' : '0',
            'showDate'      => !empty($settings['show_date'])        ? '1' : '0',
            'showHeader'    => !empty($settings['show_header'])      ? '1' : '0',
            'tabs'          => !empty($settings['show_sport_tabs'])  ? '1' : '0',
            'theme'         => sanitize_text_field($settings['theme']           ?? 'light'),
            'accent'        => sanitize_text_field($accent_hex),
            'font'          => sanitize_text_field($settings['font']            ?? 'system'),
            'matchFontSize' => sanitize_text_field((string)($settings['match_font_size'] ?? '14')),
            'timeFontSize'  => sanitize_text_field((string)($settings['time_font_size']  ?? '11')),
            'dateFontSize'  => sanitize_text_field((string)($settings['date_font_size']  ?? '11')),
            'logoSize'      => sanitize_text_field($settings['logo_size']       ?? 'md'),
            'headerSize'    => sanitize_text_field((string)($settings['header_size']     ?? '16')),
            'highlightFontSize' => sanitize_text_field((string)($settings['highlight_font_size'] ?? '14')),
            'lineHeight'    => sanitize_text_field($settings['line_height'] ?? '1.6'),
            'hideLogos'     => !empty($settings['hide_logos']) ? '1' : '0',
            'noCopy'        => !empty($settings['no_copy'])    ? '1' : '0',
            'hideViewToggle' => empty($settings['show_view_toggle']) ? '1' : '0',
            'padding'       => sanitize_text_field((string)($settings['padding']   ?? '12')),
            'tabStyle'      => sanitize_text_field($settings['tab_style'] ?? 'pill'),
            'noInlineToggle' => !empty($settings['show_view_toggle']) ? '1' : '0',
            '_wid'          => sanitize_text_field($widget_id),
        ];
        // Map the unified Schedule View setting to the correct URL params
        $view_mode = sanitize_text_field($settings['list_style'] ?? 'default');
        if ($view_mode === 'calendar') {
            $query_args['layout'] = 'calendar';
        } else {
            $query_args['layout']    = 'list';
            $query_args['listStyle'] = $view_mode;
        }
        if (!empty($settings['embed_id'])) {
            $query_args['embedId'] = sanitize_text_field($settings['embed_id']);
        }
        if (!empty($bg_hex)) {
            $query_args['bg'] = sanitize_text_field($bg_hex);
        }
        if (!empty($text_hex)) {
            $query_args['textColor'] = sanitize_text_field($text_hex);
        }
        $app_domain = schedule_get_app_domain();
        $iframe_url = $app_domain . '/embed/' . sanitize_text_field($iframe_key) . '?' . http_build_query($query_args);
        $height_val = ($settings['iframe_height']['size'] ?? 600) . ($settings['iframe_height']['unit'] ?? 'px');
        $uid = 'sb' . substr(md5($iframe_url . rand()), 0, 8);
        $height_css = $auto_height ? 'auto'    : esc_attr($height_val);
        $overflow   = $auto_height ? 'visible' : 'auto';
        ?>
        <style>
        .elementor-widget-schedule_widget,
        .elementor-widget-schedule_widget > .elementor-widget-container {
            background: transparent !important;
            background-color: transparent !important;
        }
        </style>
        <?php if (!empty($settings['show_view_toggle'])) :
            $is_cal = ($view_mode === 'calendar');
            $btn_base = 'cursor:pointer;padding:5px 14px;border-radius:999px;border:1px solid;font-size:13px;font-family:inherit;font-weight:500;transition:all .15s;background:transparent';
            $btn_active = 'background:#' . esc_attr($accent_hex) . '!important;color:#fff!important;border-color:#' . esc_attr($accent_hex) . '!important;font-weight:600!important';
            $btn_inactive = 'background:rgba(128,128,128,0.08);color:#555;border-color:#d1d5db';
        ?>
        <div id="<?php echo esc_attr($uid); ?>-toggle" style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:8px">
            <button id="<?php echo esc_attr($uid); ?>-btn-list" onclick="sbToggle_<?php echo esc_js($uid); ?>(this,'list')" style="<?php echo $btn_base; ?>;<?php echo $is_cal ? $btn_inactive : $btn_active; ?>">List</button>
            <button id="<?php echo esc_attr($uid); ?>-btn-cal" onclick="sbToggle_<?php echo esc_js($uid); ?>(this,'calendar')" style="<?php echo $btn_base; ?>;<?php echo $is_cal ? $btn_active : $btn_inactive; ?>">Calendar</button>
        </div>
        <script>
        function sbToggle_<?php echo esc_js($uid); ?>(btn, layout) {
            var frame = document.getElementById('<?php echo esc_js($uid); ?>-frame');
            if (!frame) return;
            try {
                var u = new URL(frame.src);
                u.searchParams.set('layout', layout);
                if (layout === 'list') {
                    u.searchParams.set('listStyle', '<?php echo esc_js($view_mode === 'calendar' ? 'default' : $view_mode); ?>');
                }
                u.searchParams.set('noInlineToggle', '1');
                frame.style.height = '0';
                frame.src = u.toString();
            } catch(e) {}
            var ac = '#<?php echo esc_js($accent_hex); ?>';
            btn.parentNode.querySelectorAll('button').forEach(function(b) {
                var a = b === btn;
                b.style.cssText = '<?php echo esc_js($btn_base); ?>;' + (a
                    ? 'background:' + ac + '!important;color:#fff!important;border-color:' + ac + '!important;font-weight:600!important'
                    : 'background:rgba(128,128,128,0.08);color:#555;border-color:#d1d5db');
            });
        }
        </script>
        <?php endif; ?>
        <div class="schedule-wrapper" id="<?php echo esc_attr($uid); ?>" style="position:relative;width:100%!important;max-width:100%!important;height:<?php echo $height_css; ?>;overflow:<?php echo $overflow; ?>;border:none!important;background:transparent!important;">
            <!-- Narrow grab-handle at top: lets Elementor select the widget without blocking iframe content -->
            <div class="schedule-editor-overlay" style="display:none;position:absolute;top:0;left:0;right:0;height:20px;z-index:2;cursor:grab;" title="Drag to reposition"><span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:13px;color:rgba(150,150,150,0.55);pointer-events:none;user-select:none;">&#8942;</span></div>
            <iframe id="<?php echo esc_attr($uid); ?>-frame"
                src="<?php echo esc_url($iframe_url); ?>"
                style="position:relative;z-index:1;width:100%!important;height:<?php echo ($auto_height ? '0' : esc_attr($height_val)); ?>;border:none!important;display:block!important;"
                scrolling="<?php echo $auto_height ? 'no' : 'auto'; ?>" loading="lazy" allowtransparency="true"></iframe>
        </div>
        <script>
        (function(){
            // Show overlay only in Elementor editor so widget is easily selectable
            var wrapper = document.getElementById('<?php echo esc_js($uid); ?>');
            if (!wrapper) return;
            function checkEditor() {
                try {
                    if (
                        (window.elementorFrontend && window.elementorFrontend.isEditMode && window.elementorFrontend.isEditMode()) ||
                        (window.parent && window.parent.elementor)
                    ) {
                        var overlay = wrapper.querySelector('.schedule-editor-overlay');
                        if (overlay) overlay.style.display = 'block';
                    }
                } catch(e) {}
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', checkEditor);
            } else {
                checkEditor();
            }
        })();
        </script>
        <script>
        (function(){
            var fid = '<?php echo esc_js($uid); ?>-frame';
            window.addEventListener('message', function(e){
                if (e.data && typeof e.data.sbHeight === 'number') {
                    var f = document.getElementById(fid);
                    try { if (f && new URL(f.src).origin === e.origin) { f.style.height = e.data.sbHeight + 'px'; } } catch(err) {}
                    // Relay to the Elementor editor window (parent of the preview iframe)
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ sbHeight: e.data.sbHeight, sbFromWidget: true }, '*');
                        }
                    } catch(er) {}
                }
            });
            // MutationObserver: fire DELETE to clean up Supabase when this embed's DOM node is removed.
            // Observe document.body because when Elementor deletes a widget the entire container is
            // removed — observing the wrapper's parent gets disconnected silently.
            (function(){
                var wid = document.getElementById('<?php echo esc_js($uid); ?>');
                if (!wid || !window.MutationObserver) return;
                var deleted = false;
                var stableId = '<?php echo esc_js($widget_id); ?>';
                var obs = new MutationObserver(function(mutations) {
                    // Only fire from WordPress context, never from inside the embed iframe
                    try {
                        var _inWpCtx = (
                            (window.elementorFrontend && typeof window.elementorFrontend.isEditMode === 'function' && window.elementorFrontend.isEditMode()) ||
                            !!(window.parent && window.parent !== window && window.parent.elementor)
                        );
                        if (!_inWpCtx) return;
                    } catch(e) { return; }
                    if (deleted) return;
                    for (var i = 0; i < mutations.length; i++) {
                        var rn = mutations[i].removedNodes;
                        for (var j = 0; j < rn.length; j++) {
                            var node = rn[j];
                            if (node.nodeType !== 1) continue;
                            if (node === wid || (node.contains && node.contains(wid))) {
                                deleted = true;
                                // Debounce: wait 10s to survive Elementor iframe re-renders (confirmed ~2-3s)
                                setTimeout(function() {
                                    var stillExists = false;
                                    if (stableId) {
                                        if (document.querySelector('[data-id="' + stableId + '"]')) {
                                            stillExists = true;
                                        }
                                        try {
                                            var pf = window.parent && window.parent.document &&
                                                window.parent.document.getElementById('elementor-preview-iframe');
                                            if (pf && pf.contentDocument &&
                                                pf.contentDocument.querySelector('[data-id="' + stableId + '"]')) {
                                                stillExists = true;
                                            }
                                        } catch(e) {}
                                    }
                                    if (stillExists) { deleted = false; return; }
                                    obs.disconnect();
                                    var delParams = {};
                                    <?php if (!empty($widget_id)): ?>delParams.widgetId = '<?php echo esc_js($widget_id); ?>';<?php elseif (!empty($settings['embed_id'])): ?>delParams.embedId = '<?php echo esc_js($settings['embed_id']); ?>';<?php else: ?>delParams.embedId = '__null__';<?php endif; ?>
                                    if (typeof sbFireDelete === 'function') sbFireDelete(delParams);
                                }, 10000);
                                return;
                            }
                        }
                    }
                });
                obs.observe(document.body, { childList: true, subtree: true });
            })();
        })();
        </script>
        <?php
    }
}
}
