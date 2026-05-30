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
        'seo'             => '0',
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

    // Deterministic UID — must NOT use rand() because Elementor re-renders the
    // shortcode with a new PHP execution, and if the UID changes the MutationObserver
    // can no longer find the old element and fires a false-positive DELETE.
    $uid        = 'sb' . substr(md5(serialize($atts)), 0, 8);
    $app_domain  = schedule_get_app_domain();
    $iframe_url = $app_domain . '/embed/' . sanitize_text_field($iframe_key) . '?' . http_build_query($query_args);
    $auto       = ($atts['height'] === 'auto');
    $height_css = $auto ? 'auto' : esc_attr($atts['height']);
    $overflow   = $auto ? 'visible' : 'auto';
    $accent_hex = ltrim(sanitize_hex_color('#' . ltrim($atts['accent'], '#')), '#');
    $is_cal     = ($atts['layout'] === 'calendar');
    ob_start();
    if ($atts['show_view_toggle'] === '1') :
        $ac = '#' . esc_attr($accent_hex);
        $seg = 'cursor:pointer;padding:5px 14px;font-size:13px;font-family:inherit;transition:all .15s;border-radius:0';
        $list_active   = $seg . ';border:1px solid ' . $ac . ';border-right:none;background:' . $ac . ';color:#fff;font-weight:600';
        $list_inactive = $seg . ';border:1px solid #d1d5db;border-right:none;background:rgba(128,128,128,0.08);color:#555;font-weight:500';
        $cal_active    = $seg . ';border:1px solid ' . $ac . ';background:' . $ac . ';color:#fff;font-weight:600';
        $cal_inactive  = $seg . ';border:1px solid #d1d5db;background:rgba(128,128,128,0.08);color:#555;font-weight:500';
    ?>
    <div id="<?php echo esc_attr($uid); ?>-toggle" style="display:flex;justify-content:flex-start;gap:0;margin-bottom:8px">
        <button id="<?php echo esc_attr($uid); ?>-btn-list" onclick="sbToggle_<?php echo esc_js($uid); ?>(this,'list')" style="<?php echo $is_cal ? $list_inactive : $list_active; ?>">List</button>
        <button id="<?php echo esc_attr($uid); ?>-btn-cal" onclick="sbToggle_<?php echo esc_js($uid); ?>(this,'calendar')" style="<?php echo $is_cal ? $cal_active : $cal_inactive; ?>">Calendar</button>
    </div>
    <script>
    function sbLog_<?php echo esc_js($uid); ?>() {
        try { if (window.console && console.debug) console.debug.apply(console, ['[ScoreBar widget <?php echo esc_js($uid); ?>]'].concat([].slice.call(arguments))); } catch(e) {}
    }
    function sbToggle_<?php echo esc_js($uid); ?>(btn, layout) {
        var frame = document.getElementById('<?php echo esc_js($uid); ?>-frame');
        if (!frame) return;
        try {
            var next = sbBuildUrl_<?php echo esc_js($uid); ?>(layout);
            sbLog_<?php echo esc_js($uid); ?>('toggle', layout, next);
            frame.setAttribute('data-layout', layout);
            frame.src = next;
            setTimeout(sbRequestHeight_<?php echo esc_js($uid); ?>, 120);
            setTimeout(sbRequestHeight_<?php echo esc_js($uid); ?>, 500);
        } catch(e) { sbLog_<?php echo esc_js($uid); ?>('toggle error', e); }
        var ac = '#<?php echo esc_js($accent_hex); ?>';
        var seg = 'cursor:pointer;padding:5px 14px;font-size:13px;font-family:inherit;transition:all .15s;border-radius:0';
        var btns = btn.parentNode.querySelectorAll('button');
        btns.forEach(function(b, i) {
            var isActive = b === btn;
            var isLast = i === btns.length - 1;
            var br = isLast ? '' : ';border-right:none';
            if (isActive) {
                b.style.cssText = seg + ';border:1px solid ' + ac + br + ';background:' + ac + ';color:#fff;font-weight:600';
            } else {
                b.style.cssText = seg + ';border:1px solid #d1d5db' + br + ';background:rgba(128,128,128,0.08);color:#555;font-weight:500';
            }
        });
    }
    function sbBuildUrl_<?php echo esc_js($uid); ?>(layout) {
        var base = document.getElementById('<?php echo esc_js($uid); ?>-frame');
        var u = new URL(base.src);
        u.searchParams.set('layout', layout);
        if (layout === 'list') { u.searchParams.set('listStyle', '<?php echo esc_js($atts['list_style'] !== 'calendar' ? $atts['list_style'] : 'default'); ?>'); }
        u.searchParams.set('noInlineToggle', '1');
        return u.toString();
    }
    function sbRequestHeight_<?php echo esc_js($uid); ?>() {
        var frame = document.getElementById('<?php echo esc_js($uid); ?>-frame');
        try { if (frame && frame.contentWindow) frame.contentWindow.postMessage({ sbRequestHeight: true }, '*'); } catch(e) {}
    }
    </script>
    <?php endif; ?>
    <div class="schedule-wrapper" id="<?php echo esc_attr($uid); ?>" style="position:relative;width:100%!important;max-width:100%!important;height:<?php echo $height_css; ?>;overflow:<?php echo $overflow; ?>;border:none!important;background:transparent!important;">
        <!-- Narrow grab-handle at top: lets Elementor select the widget without blocking iframe content -->
            <div class="schedule-editor-overlay" style="display:none;position:absolute;top:0;left:0;right:0;height:20px;z-index:2;cursor:grab;" title="Drag to reposition"><span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:13px;color:rgba(150,150,150,0.55);pointer-events:none;user-select:none;">&#8942;</span></div>
        <iframe id="<?php echo esc_attr($uid); ?>-frame"
            data-layout="<?php echo $is_cal ? 'calendar' : 'list'; ?>"
            src="<?php echo esc_url($iframe_url); ?>"
            style="position:relative;z-index:1;width:100%!important;height:<?php echo ($auto ? '480px' : $height_css); ?>;border:none!important;display:block!important;<?php echo $auto ? 'overflow:hidden!important;' : ''; ?>"
            scrolling="<?php echo $auto ? 'no' : 'auto'; ?>" loading="<?php echo $auto ? 'eager' : 'lazy'; ?>" title="Score Bar schedule" referrerpolicy="strict-origin-when-cross-origin" allowtransparency="true"></iframe>
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
        var frame = document.getElementById(fid);
        function requestHeight() {
            try { if (frame && frame.contentWindow) frame.contentWindow.postMessage({ sbRequestHeight: true }, '*'); } catch(e) {}
        }
        if (frame) frame.addEventListener('load', function(){
            try { if (typeof sbLog_<?php echo esc_js($uid); ?> === 'function') sbLog_<?php echo esc_js($uid); ?>('iframe loaded', frame.getAttribute('data-layout'), frame.src); } catch(e) {}
            setTimeout(requestHeight, 60);
            setTimeout(requestHeight, 300);
        });
        window.addEventListener('message', function(e){
            if (e.data && typeof e.data.sbHeight === 'number') {
                var f = document.getElementById(fid);
                try {
                    if (f && e.source === f.contentWindow) {
                        try { if (typeof sbLog_<?php echo esc_js($uid); ?> === 'function') sbLog_<?php echo esc_js($uid); ?>('height', e.data.sbHeight, f.getAttribute('data-layout')); } catch(logErr) {}
                        if (e.data.sbHeight >= 120) f.style.height = e.data.sbHeight + 'px';
                    }
                } catch(err) { sbLog_<?php echo esc_js($uid); ?>('height error', err); }
            }
        });
        // MutationObserver: fire DELETE when this embed is permanently removed from the DOM.
        // Confirms briefly to survive Elementor re-renders without making real deletes feel stale.
        (function(){
            var wid = document.getElementById('<?php echo esc_js($uid); ?>');
            if (!wid || !window.MutationObserver) return;
            var deleted = false;
            var widId = '<?php echo esc_js($uid); ?>';
            var obs = new MutationObserver(function(mutations) {
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
                            var checks = 0;
                            var iv = setInterval(function() {
                                checks++;
                                if (document.getElementById(widId)) { deleted = false; clearInterval(iv); return; }
                                if (checks >= 3) {
                                    clearInterval(iv);
                                    var delParams = {};
                                    <?php if (!empty($atts['embed_id'])): ?>delParams.embedId = '<?php echo esc_js($atts['embed_id']); ?>';<?php else: ?>deleted = false; return;<?php endif; ?>
                                    obs.disconnect();
                                    if (typeof sbFireDelete === 'function') sbFireDelete(delParams);
                                }
                            }, 1000);
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
    if ($atts['seo'] !== '0' && function_exists('schedule_render_seo_block')) {
        echo schedule_render_seo_block($iframe_url);
    }
    ?>
    <?php
    return ob_get_clean();
}
}
add_shortcode('schedule',          'schedule_shortcode_render');
add_shortcode('scorebar_schedule', 'schedule_shortcode_render'); // backward compat alias
add_shortcode('sports_schedule',   'schedule_shortcode_render');
