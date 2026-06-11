<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('schedule_get_public_embed_key')) {
function schedule_get_public_embed_key() {
    $api_key     = get_option('schedule_api_key', '');
    $embed_token = get_option('schedule_embed_token', '');
    return !empty($embed_token) ? $embed_token : $api_key;
}
}

if (!function_exists('schedule_shortcode_default_atts')) {
function schedule_shortcode_default_atts() {
    return [
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
    ];
}
}

if (!function_exists('schedule_shortcode_embed_url')) {
function schedule_shortcode_embed_url($raw_atts) {
    $iframe_key = schedule_get_public_embed_key();
    if (empty($iframe_key)) return '';

    $atts = shortcode_atts(schedule_shortcode_default_atts(), $raw_atts, 'schedule');
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

    return schedule_get_app_domain() . '/embed/' . sanitize_text_field($iframe_key) . '?' . http_build_query($query_args);
}
}

if (!function_exists('schedule_elementor_embed_url')) {
function schedule_elementor_embed_url($settings, $widget_id = '') {
    $iframe_key = schedule_get_public_embed_key();
    if (empty($iframe_key)) return '';

    $accent_hex = ltrim($settings['accent_color'] ?? '#4b5563', '#');
    $query_args = [
        'showTime'      => !empty($settings['show_time']) ? '1' : '0',
        'showDate'      => !empty($settings['show_date']) ? '1' : '0',
        'showHeader'    => !empty($settings['show_header']) ? '1' : '0',
        'tabs'          => !empty($settings['show_sport_tabs']) ? '1' : '0',
        'theme'         => sanitize_text_field($settings['theme'] ?? 'light'),
        'accent'        => sanitize_text_field($accent_hex),
        'font'          => sanitize_text_field($settings['font'] ?? 'system'),
        'matchFontSize' => sanitize_text_field((string)($settings['match_font_size'] ?? '14')),
        'timeFontSize'  => sanitize_text_field((string)($settings['time_font_size'] ?? '11')),
        'dateFontSize'  => sanitize_text_field((string)($settings['date_font_size'] ?? '11')),
        'logoSize'      => sanitize_text_field($settings['logo_size'] ?? 'md'),
        'headerSize'    => sanitize_text_field((string)($settings['header_size'] ?? '16')),
        'highlightFontSize' => sanitize_text_field((string)($settings['highlight_font_size'] ?? '14')),
        'lineHeight'    => sanitize_text_field($settings['line_height'] ?? '1.6'),
        'hideLogos'     => !empty($settings['hide_logos']) ? '1' : '0',
        'noCopy'        => !empty($settings['no_copy']) ? '1' : '0',
        'hideViewToggle' => empty($settings['show_view_toggle']) ? '1' : '0',
        'padding'       => sanitize_text_field((string)($settings['padding'] ?? '12')),
        'tabStyle'      => sanitize_text_field($settings['tab_style'] ?? 'pill'),
        'noInlineToggle' => !empty($settings['show_view_toggle']) ? '1' : '0',
        '_wid'          => sanitize_text_field($widget_id),
    ];

    $view_mode = sanitize_text_field($settings['list_style'] ?? 'default');
    if ($view_mode === 'calendar') {
        $query_args['layout'] = 'calendar';
    } else {
        $query_args['layout'] = 'list';
        $query_args['listStyle'] = $view_mode;
    }
    if (!empty($settings['embed_id'])) {
        $query_args['embedId'] = sanitize_text_field($settings['embed_id']);
    }
    if (!empty($settings['bg_color'])) {
        $query_args['bg'] = sanitize_text_field(ltrim($settings['bg_color'], '#'));
    }
    if (!empty($settings['text_color'])) {
        $query_args['textColor'] = sanitize_text_field(ltrim($settings['text_color'], '#'));
    }

    return schedule_get_app_domain() . '/embed/' . sanitize_text_field($iframe_key) . '?' . http_build_query($query_args);
}
}

if (!function_exists('schedule_current_page_url')) {
function schedule_current_page_url() {
    if (is_singular()) {
        $permalink = get_permalink();
        if ($permalink) return $permalink;
    }
    return home_url(add_query_arg(null, null));
}
}

if (!function_exists('schedule_is_editor_context')) {
function schedule_is_editor_context() {
    if (is_admin()) return true;
    if (function_exists('wp_doing_ajax') && wp_doing_ajax()) return true;
    if (function_exists('wp_doing_cron') && wp_doing_cron()) return true;
    if (function_exists('wp_is_json_request') && wp_is_json_request()) return true;

    $action = isset($_GET['action']) ? sanitize_key(wp_unslash($_GET['action'])) : '';
    return $action === 'elementor'
        || isset($_GET['elementor-preview'])
        || isset($_GET['elementor_library'])
        || isset($_GET['elementor_page_id']);
}
}

if (!function_exists('schedule_fetch_seo_payload')) {
function schedule_fetch_seo_payload($iframe_url) {
    if (schedule_is_editor_context()) return null;
    if (empty($iframe_url)) return null;

    $seo_url = add_query_arg([
        '_seo'   => '1',
        'pageUrl' => schedule_current_page_url(),
    ], $iframe_url);
    $cache_key = 'sb_seo_' . md5($seo_url);
    $fail_key  = $cache_key . '_fail';
    $cached = get_transient($cache_key);
    if (is_array($cached)) return $cached;
    if (get_transient($fail_key)) return null;

    $app = schedule_get_app_domain();
    $is_local = strpos($app, 'localhost') !== false || strpos($app, '127.0.0.1') !== false || strpos($app, '.local') !== false;
    $response = wp_remote_get($seo_url, [
        'timeout' => 1.5,
        'redirection' => 2,
        'sslverify' => !$is_local,
    ]);
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        set_transient($fail_key, 1, MINUTE_IN_SECONDS);
        return null;
    }

    $payload = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($payload) || empty($payload['bodyHtml'])) {
        set_transient($fail_key, 1, MINUTE_IN_SECONDS);
        return null;
    }

    delete_transient($fail_key);

    set_transient($cache_key, $payload, 5 * MINUTE_IN_SECONDS);
    return $payload;
}
}

if (!function_exists('schedule_allowed_seo_html')) {
function schedule_allowed_seo_html() {
    $allowed = wp_kses_allowed_html('post');
    $allowed['section'] = ['class' => true, 'id' => true, 'aria-label' => true];
    $allowed['time'] = ['datetime' => true];
    $allowed['details'] = ['class' => true];
    $allowed['summary'] = [];
    return $allowed;
}
}

if (!function_exists('schedule_compose_seo_title')) {
function schedule_compose_seo_title($payload_title) {
    $parts = [];
    $seen = [];

    // Page name FIRST so the WordPress page title is never replaced/hidden
    // by widget content. Payload title is appended as descriptive context
    // and site name closes the chain.
    $candidates = [
        is_singular() ? sanitize_text_field(get_the_title()) : '',
        sanitize_text_field($payload_title),
        sanitize_text_field(get_bloginfo('name')),
    ];

    foreach ($candidates as $candidate) {
        $candidate = trim($candidate);
        $key = strtolower($candidate);
        if ($candidate === '' || isset($seen[$key])) continue;
        $parts[] = $candidate;
        $seen[$key] = true;
    }

    return implode(' | ', $parts);
}
}

if (!function_exists('schedule_render_seo_block')) {
function schedule_render_seo_block($iframe_url) {
    if (schedule_is_editor_context()) return '';

    $payload = schedule_fetch_seo_payload($iframe_url);
    if (!$payload) return '';

    $title = sanitize_text_field($payload['title'] ?? 'Sports schedule');
    $description = sanitize_text_field($payload['description'] ?? 'Upcoming sports schedule.');
    $json_ld = !empty($payload['jsonLd']) ? wp_json_encode($payload['jsonLd'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '';

    if (!$json_ld) return '';

    ob_start();
    ?>
    <script type="application/ld+json"><?php echo $json_ld; ?></script>
    <?php
    return ob_get_clean();
}
}

if (!function_exists('schedule_find_first_shortcode_iframe_url')) {
function schedule_find_first_shortcode_iframe_url($content) {
    if (empty($content) || !function_exists('get_shortcode_regex')) return '';
    $tags = ['schedule', 'scorebar_schedule', 'sports_schedule'];
    if (!preg_match_all('/' . get_shortcode_regex($tags) . '/s', $content, $matches, PREG_SET_ORDER)) return '';
    foreach ($matches as $match) {
        $atts = shortcode_parse_atts($match[3] ?? '');
        if (!is_array($atts)) continue;
        // Only treat shortcode as SEO-bearing when user explicitly opted in.
        if (empty($atts['seo']) || $atts['seo'] !== '1') continue;
        return schedule_shortcode_embed_url($atts);
    }
    return '';
}
}

if (!function_exists('schedule_find_first_elementor_iframe_url')) {
function schedule_find_first_elementor_iframe_url($elements) {
    if (!is_array($elements)) return '';
    foreach ($elements as $element) {
        if (!is_array($element)) continue;
        if (($element['elType'] ?? '') === 'widget' && ($element['widgetType'] ?? '') === 'schedule_widget') {
            $settings = $element['settings'] ?? [];
            // Only treat widget as SEO-bearing when user explicitly opted in.
            if (empty($settings['seo_content'])) continue;
            return schedule_elementor_embed_url($settings, $element['id'] ?? '');
        }
        $nested = schedule_find_first_elementor_iframe_url($element['elements'] ?? []);
        if ($nested) return $nested;
    }
    return '';
}
}

if (!function_exists('schedule_current_page_seo_payload')) {
function schedule_current_page_seo_payload() {
    static $payload = false;
    if ($payload !== false) return $payload;
    $payload = null;
    if (schedule_is_editor_context()) return null;
    if (!is_singular()) return null;

    global $post;
    if (!$post) return null;

    $iframe_url = schedule_find_first_shortcode_iframe_url($post->post_content ?? '');
    if (!$iframe_url) {
        $data = get_post_meta($post->ID, '_elementor_data', true);
        if ($data) {
            $decoded = is_string($data) ? json_decode($data, true) : $data;
            $iframe_url = schedule_find_first_elementor_iframe_url($decoded);
        }
    }

    if ($iframe_url) {
        $payload = schedule_fetch_seo_payload($iframe_url);
    }
    return $payload;
}
}

if (!function_exists('schedule_filter_document_title')) {
function schedule_filter_document_title($title) {
    $payload = schedule_current_page_seo_payload();
    if (!$payload || empty($payload['title'])) return $title;
    return schedule_compose_seo_title($payload['title']);
}
}
add_filter('pre_get_document_title', 'schedule_filter_document_title', 20);

if (!function_exists('schedule_output_head_seo')) {
function schedule_output_head_seo() {
    $payload = schedule_current_page_seo_payload();
    if (!$payload) return;
    $description = sanitize_text_field($payload['description'] ?? 'Upcoming sports schedule.');
    $title = sanitize_text_field($payload['title'] ?? 'Sports schedule');
    $full_title = schedule_compose_seo_title($title);
    echo '<meta name="description" content="' . esc_attr($description) . '" />' . "\n";
    echo '<meta property="og:title" content="' . esc_attr($full_title) . '" />' . "\n";
    echo '<meta property="og:description" content="' . esc_attr($description) . '" />' . "\n";
}
}
add_action('wp_head', 'schedule_output_head_seo', 4);
