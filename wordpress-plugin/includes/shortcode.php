<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('schedule_shortcode_render')) {
function schedule_shortcode_render($atts) {
    if (!function_exists('get_option')) return '';
    $api_key = get_option('schedule_api_key', '');
    if (empty($api_key)) { return '<p style="color:red; border:1px solid red; padding:10px;">Scheduler Error: API Key not configured in settings.</p>'; }
    // Use the public embed token in the iframe URL — it is a one-way hash and cannot
    // be used to access the account. Fall back to the raw key for legacy installs.
    $embed_token = get_option('schedule_embed_token', '');
    $iframe_key  = !empty($embed_token) ? $embed_token : $api_key;

    $atts = shortcode_atts([
        'show_time'       => '1',
        'show_date'       => '1',
        'show_header'     => '1',
        'height'          => 'auto',
        'theme'           => 'light',
        'font'            => 'system',
        'logo_size'       => 'md',
        'header_size'     => '16',
        'match_font_size' => '14',
        'time_font_size'  => '11',
        'date_font_size'  => '11',
        'highlight_font_size' => '14',
        'show_view_toggle'    => '1',
        'line_height'     => '1.6',
        'compact'         => '0',
        'tabs'            => '1',
        'accent'          => '4b5563',
        'hide_logos'      => '0',
        'bg'              => '',
        'text_color'      => '',
        'padding'         => '12',
        'tab_style'       => 'pill',
        'list_style'      => 'default',
        'layout'          => 'list',
        'embed_id'        => '',
        'cat_labels'      => '',
    ], $atts, 'schedule');

    $query_args = [
        'showTime'      => $atts['show_time'],
        'showDate'      => $atts['show_date'],
        'showHeader'    => $atts['show_header'],
        'theme'         => sanitize_text_field($atts['theme']),
        'font'          => sanitize_text_field($atts['font']),
        'logoSize'      => sanitize_text_field($atts['logo_size']),
        'headerSize'    => sanitize_text_field($atts['header_size']),
        'matchFontSize' => sanitize_text_field($atts['match_font_size']),
        'timeFontSize'  => sanitize_text_field($atts['time_font_size']),
        'dateFontSize'  => sanitize_text_field($atts['date_font_size']),
        'highlightFontSize' => sanitize_text_field($atts['highlight_font_size']),
        'hideViewToggle'    => $atts['show_view_toggle'] !== '1' ? '1' : '0',
        'lineHeight'    => sanitize_text_field($atts['line_height']),
        'compact'       => $atts['compact'],
        'tabs'          => $atts['tabs'],
        'accent'        => ltrim(sanitize_hex_color('#' . ltrim($atts['accent'], '#')), '#'),
        'hideLogos'     => $atts['hide_logos'],
        'padding'       => sanitize_text_field($atts['padding']),
        'tabStyle'      => sanitize_text_field($atts['tab_style']),
        'listStyle'     => sanitize_text_field($atts['list_style']),
        'layout'        => sanitize_text_field($atts['layout']),
        'noInlineToggle' => $atts['show_view_toggle'] === '1' ? '1' : '0',
    ];

    if (!empty($atts['embed_id'])) {
        $query_args['embedId'] = sanitize_text_field($atts['embed_id']);
    }
    if (!empty($atts['cat_labels'])) {
        // Format: Football:Soccer,Rugby:NRL  → base64-encode the JSON for the embed URL
        $pairs = explode(',', $atts['cat_labels']);
        $map   = [];
        foreach ($pairs as $pair) {
            $kv = explode(':', trim($pair), 2);
            if (count($kv) === 2 && $kv[0] !== '' && $kv[1] !== '') {
                $map[sanitize_text_field($kv[0])] = sanitize_text_field($kv[1]);
            }
        }
        if (!empty($map)) {
            $query_args['catLabels'] = base64_encode(wp_json_encode($map));
        }
    }

    if (!empty($atts['bg'])) {
        $query_args['bg'] = ltrim(sanitize_hex_color('#' . ltrim($atts['bg'], '#')), '#');
    }
    if (!empty($atts['text_color'])) {
        $query_args['textColor'] = ltrim(sanitize_hex_color('#' . ltrim($atts['text_color'], '#')), '#');
    }

    $uid        = 'sb' . substr(md5(serialize($atts) . rand()), 0, 8);
    $app_domain  = schedule_get_app_domain();
    if (empty($app_domain)) {
        return '<p style="color:#c00;font-size:14px;">Scheduler: App URL is not configured. Go to <strong>Settings &gt; Scheduler</strong> to set it.</p>';
    }
    $iframe_url = $app_domain . '/embed/' . sanitize_text_field($iframe_key) . '?' . http_build_query($query_args);
    $auto       = ($atts['height'] === 'auto');
    $height_css = $auto ? 'auto' : esc_attr($atts['height']);
    $overflow   = $auto ? 'visible' : 'auto';
    $accent_hex = ltrim(sanitize_hex_color('#' . ltrim($atts['accent'], '#')), '#');
    $is_cal     = ($atts['layout'] === 'calendar');
    ob_start();
    if ($atts['show_view_toggle'] === '1') :
        $btn_base = 'cursor:pointer;padding:5px 14px;border-radius:999px;border:1px solid;font-size:13px;font-family:inherit;font-weight:500;transition:all .15s;background:transparent';
        $btn_active   = 'background:#' . esc_attr($accent_hex) . '!important;color:#fff!important;border-color:#' . esc_attr($accent_hex) . '!important;font-weight:600!important';
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
            if (layout === 'list') { u.searchParams.set('listStyle', '<?php echo esc_js($atts['list_style'] !== 'calendar' ? $atts['list_style'] : 'default'); ?>'); }
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
            style="position:relative;z-index:1;width:100%!important;height:<?php echo ($auto ? '0' : $height_css); ?>;border:none!important;display:block!important;"
            scrolling="<?php echo $auto ? 'no' : 'auto'; ?>" loading="lazy" allowtransparency="true"></iframe>
    </div>
    <script>
    (function(){
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
            }
        });
        // MutationObserver: fire DELETE to clean up Supabase when this embed is removed from the DOM.
        // Observe document.body (not the wrapper's parent) because when Elementor deletes a widget
        // the entire container is removed — if we observed the parent, it gets disconnected silently.
        (function(){
            var wid = document.getElementById('<?php echo esc_js($uid); ?>');
            if (!wid || !window.MutationObserver) return;
            var deleted = false;
            var widId = '<?php echo esc_js($uid); ?>';
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
                            // Debounce: wait 2s to avoid false positives from Elementor re-renders
                            setTimeout(function() {
                                if (document.getElementById(widId)) { deleted = false; return; }
                                obs.disconnect();
                                var delParams = {};
                                <?php if (!empty($atts['embed_id'])): ?>delParams.embedId = '<?php echo esc_js($atts['embed_id']); ?>';<?php else: ?>delParams.embedId = '__null__';<?php endif; ?>
                                if (typeof sbFireDelete === 'function') sbFireDelete(delParams);
                            }, 2000);
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
    return ob_get_clean();
}
}
add_shortcode('schedule',          'schedule_shortcode_render');
add_shortcode('scorebar_schedule', 'schedule_shortcode_render'); // backward compat alias
add_shortcode('sports_schedule',   'schedule_shortcode_render');
