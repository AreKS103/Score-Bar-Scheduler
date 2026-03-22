<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('scorebar_app_shortcode_render')) {
function scorebar_app_shortcode_render($atts) {
    if (!function_exists('get_option')) return '';
    $api_key = get_option('scorebar_app_api_key', '');
    if (empty($api_key)) { return '<p style="color:red; border:1px solid red; padding:10px;">Scheduler Error: API Key not configured in settings.</p>'; }
    // Use the public embed token in the iframe URL — it is a one-way hash and cannot
    // be used to access the account. Fall back to the raw key for legacy installs.
    $embed_token = get_option('scorebar_embed_token', '');
    $iframe_key  = !empty($embed_token) ? $embed_token : $api_key;

    $atts = shortcode_atts([
        'show_time'       => '1',
        'show_date'       => '1',
        'show_header'     => '1',
        'height'          => 'auto',
        'theme'           => 'light',
        'font'            => 'system',
        'font_size'       => 'md',
        'logo_size'       => 'md',
        'header_size'     => 'md',
        'match_font_size' => 'md',
        'date_font_size'  => 'md',
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
    ], $atts, 'scorebar_schedule');

    $query_args = [
        'showTime'      => $atts['show_time'],
        'showDate'      => $atts['show_date'],
        'showHeader'    => $atts['show_header'],
        'theme'         => sanitize_text_field($atts['theme']),
        'font'          => sanitize_text_field($atts['font']),
        'fontSize'      => sanitize_text_field($atts['font_size']),
        'logoSize'      => sanitize_text_field($atts['logo_size']),
        'headerSize'    => sanitize_text_field($atts['header_size']),
        'matchFontSize' => sanitize_text_field($atts['match_font_size']),
        'dateFontSize'  => sanitize_text_field($atts['date_font_size']),
        'lineHeight'    => sanitize_text_field($atts['line_height']),
        'compact'       => $atts['compact'],
        'tabs'          => $atts['tabs'],
        'accent'        => ltrim(sanitize_hex_color('#' . ltrim($atts['accent'], '#')), '#'),
        'hideLogos'     => $atts['hide_logos'],
        'padding'       => sanitize_text_field($atts['padding']),
        'tabStyle'      => sanitize_text_field($atts['tab_style']),
        'listStyle'     => sanitize_text_field($atts['list_style']),
        'layout'        => sanitize_text_field($atts['layout']),
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
    $iframe_url = SCOREBAR_APP_VERCEL_DOMAIN . '/embed/' . sanitize_text_field($iframe_key) . '?' . http_build_query($query_args);
    $auto       = ($atts['height'] === 'auto');
    $height_css = $auto ? 'auto' : esc_attr($atts['height']);
    $overflow   = $auto ? 'visible' : 'auto';
    ob_start();
    ?>
    <div class="scorebar-schedule-wrapper" id="<?php echo esc_attr($uid); ?>" style="position:relative;width:100%!important;max-width:100%!important;height:<?php echo $height_css; ?>;overflow:<?php echo $overflow; ?>;border:none!important;background:transparent!important;">
        <!-- Narrow grab-handle at top: lets Elementor select the widget without blocking iframe content -->
            <div class="scorebar-editor-overlay" style="display:none;position:absolute;top:0;left:0;right:0;height:20px;z-index:2;cursor:grab;" title="Drag to reposition"><span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:13px;color:rgba(150,150,150,0.55);pointer-events:none;user-select:none;">&#8942;</span></div>
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
                    var overlay = wrapper.querySelector('.scorebar-editor-overlay');
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
    <?php if ($auto) : ?>
    <script>
    (function(){
        var fid = '<?php echo esc_js($uid); ?>-frame';
        window.addEventListener('message', function(e){
            if (e.data && typeof e.data.sbHeight === 'number') {
                var f = document.getElementById(fid);
                try { if (f && new URL(f.src).origin === e.origin) { f.style.height = e.data.sbHeight + 'px'; } } catch(err) {}
            }
        });
    })();
    </script>
    <?php endif; ?>
    <?php
    return ob_get_clean();
}
}
add_shortcode('scorebar_schedule', 'scorebar_app_shortcode_render');
add_shortcode('score_schedule',    'scorebar_app_shortcode_render');
add_shortcode('sports_schedule',   'scorebar_app_shortcode_render');
