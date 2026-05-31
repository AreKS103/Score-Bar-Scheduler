<?php
/**
 * Scheduler — "What's on tonight?" banner.
 *
 * A slim, full-width promo bar that renders ABOVE the theme header (via the
 * `wp_body_open` hook) and rotates through the highlighted (starred) matches of
 * a chosen schedule embed. The matches are pulled live from the Scheduler app's
 * public /api/banner endpoint using the site's one-way embed token.
 *
 * Configured entirely from: Scheduler → Banner (admin submenu).
 */
if (!defined('ABSPATH')) exit;

// ── Settings storage ─────────────────────────────────────────────────────────

if (!function_exists('schedule_banner_defaults')) {
    function schedule_banner_defaults() {
        return [
            'enabled'      => 0,
            'embed_id'     => '',
            'prefix'       => "What's on tonight?",
            'fallback_text'=> 'Featured games coming soon',
            'bg_color'     => '#f4efea',
            'text_color'   => '#111111',
            'accent_color' => '#111111',
            'font_size'    => 15,
            'font_family'  => "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace",
            'font_weight'  => 700,
            'accent_weight'=> 900,
            'italic'       => 0,
            'underline'    => 0,
            'strikethrough'=> 0,
            'logo_height'  => 29,
            'logo_max_width' => 116,
            'logo_padding' => 4,
            'logo_shape'   => 'rounded', // 'square' | 'rounded' | 'pill'
            'logo_bg_color'=> '#ffffff',
            'logo_bg_transparent' => 0,
            'interval'     => 5,          // seconds between slides
            'refresh_interval' => 60,     // seconds between live data checks
            'range_mode'   => 'week',     // 'today' | 'week'
            'animation'    => 'slide',    // 'slide' | 'fade'
            'position'     => 'static',   // 'static' | 'fixed'
            'uppercase'    => 1,
            'show_time'    => 1,
            'show_logos'   => 1,
            'link_url'     => '',
        ];
    }
}

if (!function_exists('schedule_banner_get_settings')) {
    function schedule_banner_get_settings() {
        $saved = get_option('schedule_banner_settings', []);
        if (!is_array($saved)) $saved = [];
        return array_merge(schedule_banner_defaults(), $saved);
    }
}

if (!function_exists('schedule_banner_sanitize')) {
    function schedule_banner_sanitize($raw) {
        $d = schedule_banner_defaults();
        $hex = function ($v, $fallback) {
            $c = sanitize_hex_color($v);
            return $c ? $c : $fallback;
        };
        $clamp = function ($v, $min, $max, $fallback) {
            if (!is_numeric($v)) return $fallback;
            $n = (int) $v;
            return max($min, min($max, $n));
        };
        return [
            'enabled'      => !empty($raw['enabled']) ? 1 : 0,
            'embed_id'     => substr(sanitize_text_field($raw['embed_id'] ?? ''), 0, 64),
            'prefix'       => substr(sanitize_text_field($raw['prefix'] ?? $d['prefix']), 0, 120),
            'fallback_text'=> substr(sanitize_text_field($raw['fallback_text'] ?? $d['fallback_text']), 0, 160),
            'bg_color'     => $hex($raw['bg_color'] ?? '', $d['bg_color']),
            'text_color'   => $hex($raw['text_color'] ?? '', $d['text_color']),
            'accent_color' => $hex($raw['accent_color'] ?? '', $d['accent_color']),
            'font_size'    => $clamp($raw['font_size'] ?? '', 10, 40, $d['font_size']),
            'font_family'  => schedule_banner_sanitize_font_stack($raw['font_family'] ?? $d['font_family'], $d['font_family']),
            'font_weight'  => $clamp($raw['font_weight'] ?? '', 100, 900, $d['font_weight']),
            'accent_weight'=> $clamp($raw['accent_weight'] ?? '', 100, 900, $d['accent_weight']),
            'italic'       => !empty($raw['italic']) ? 1 : 0,
            'underline'    => !empty($raw['underline']) ? 1 : 0,
            'strikethrough'=> !empty($raw['strikethrough']) ? 1 : 0,
            'logo_height'  => $clamp($raw['logo_height'] ?? '', 16, 80, $d['logo_height']),
            'logo_max_width' => $clamp($raw['logo_max_width'] ?? '', 32, 260, $d['logo_max_width']),
            'logo_padding' => $clamp($raw['logo_padding'] ?? '', 0, 20, $d['logo_padding']),
            'logo_shape'   => in_array(($raw['logo_shape'] ?? ''), ['square', 'rounded', 'pill'], true) ? $raw['logo_shape'] : $d['logo_shape'],
            'logo_bg_color'=> $hex($raw['logo_bg_color'] ?? '', $d['logo_bg_color']),
            'logo_bg_transparent' => !empty($raw['logo_bg_transparent']) ? 1 : 0,
            'interval'     => $clamp($raw['interval'] ?? '', 2, 30, $d['interval']),
            'refresh_interval' => $clamp($raw['refresh_interval'] ?? '', 30, 300, $d['refresh_interval']),
            'range_mode'   => in_array(($raw['range_mode'] ?? ''), ['today', 'week'], true) ? $raw['range_mode'] : $d['range_mode'],
            'animation'    => in_array(($raw['animation'] ?? ''), ['slide', 'fade'], true) ? $raw['animation'] : $d['animation'],
            'position'     => in_array(($raw['position'] ?? ''), ['static', 'fixed'], true) ? $raw['position'] : $d['position'],
            'uppercase'    => !empty($raw['uppercase']) ? 1 : 0,
            'show_time'    => !empty($raw['show_time']) ? 1 : 0,
            'show_logos'   => 1,
            'link_url'     => esc_url_raw($raw['link_url'] ?? ''),
        ];
    }
}

if (!function_exists('schedule_banner_text_decoration_css')) {
    function schedule_banner_text_decoration_css($settings) {
        $decorations = [];
        if (!empty($settings['underline'])) $decorations[] = 'underline';
        if (!empty($settings['strikethrough'])) $decorations[] = 'line-through';
        return empty($decorations) ? 'none' : implode(' ', $decorations);
    }
}

if (!function_exists('schedule_banner_logo_radius_css')) {
    function schedule_banner_logo_radius_css($shape) {
        if ($shape === 'square') return '0';
        if ($shape === 'pill') return '999px';
        return '6px';
    }
}

if (!function_exists('schedule_banner_sanitize_font_stack')) {
    function schedule_banner_sanitize_font_stack($value, $fallback = 'inherit') {
        $font = trim((string) $value);
        if ($font === '') return $fallback;
        $font = preg_replace('/[^A-Za-z0-9\s,\-_."\'()]/', '', $font);
        $font = preg_replace('/\s+/', ' ', $font);
        $font = substr($font, 0, 220);
        return trim($font) !== '' ? trim($font) : $fallback;
    }
}

if (!function_exists('schedule_banner_quote_font_family')) {
    function schedule_banner_quote_font_family($name) {
        $name = trim(wp_strip_all_tags((string) $name));
        $name = str_replace(["\\", "'"], ['', "\\'"], $name);
        return $name !== '' ? "'" . $name . "', sans-serif" : '';
    }
}

if (!function_exists('schedule_banner_add_font_option')) {
    function schedule_banner_add_font_option(&$options, $css, $label) {
        $css = schedule_banner_sanitize_font_stack($css, '');
        $label = trim(wp_strip_all_tags((string) $label));
        if ($css === '' || $label === '' || isset($options[$css])) return;
        $options[$css] = $label;
    }
}

if (!function_exists('schedule_banner_collect_font_names')) {
    function schedule_banner_collect_font_names($value, &$options) {
        if (is_string($value)) {
            $trimmed = trim($value);
            if ($trimmed === '') return;
            if (($trimmed[0] === '{' || $trimmed[0] === '[')) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    schedule_banner_collect_font_names($decoded, $options);
                    return;
                }
            }
            return;
        }

        if (!is_array($value)) return;

        foreach ($value as $key => $child) {
            $key_string = is_string($key) ? $key : '';
            if (is_string($child) && preg_match('/font[_-]?family$/i', $key_string)) {
                $css = schedule_banner_quote_font_family($child);
                if ($css !== '') schedule_banner_add_font_option($options, $css, $child);
                continue;
            }
            if (is_array($child) || is_string($child)) {
                schedule_banner_collect_font_names($child, $options);
            }
        }
    }
}

if (!function_exists('schedule_banner_get_font_options')) {
    function schedule_banner_get_font_options() {
        $options = [];
        schedule_banner_add_font_option($options, 'inherit', 'Theme / Elementor default');
        schedule_banner_add_font_option($options, "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace", 'Monospace ticker');
        schedule_banner_add_font_option($options, "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif", 'System sans');
        schedule_banner_add_font_option($options, "Georgia,'Times New Roman',serif", 'Serif');
        foreach (['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New'] as $family) {
            schedule_banner_add_font_option($options, schedule_banner_quote_font_family($family), $family);
        }

        $font_post_types = ['wp_font_family', 'elementor_font', 'custom_font', 'bsf_custom_fonts'];
        foreach ($font_post_types as $post_type) {
            if (!post_type_exists($post_type)) continue;
            $fonts = get_posts([
                'post_type'      => $post_type,
                'post_status'    => ['publish', 'private'],
                'posts_per_page' => 100,
                'orderby'        => 'title',
                'order'          => 'ASC',
                'no_found_rows'  => true,
            ]);
            foreach ($fonts as $font) {
                $label = get_the_title($font);
                $css = schedule_banner_quote_font_family($label);
                if ($css !== '') schedule_banner_add_font_option($options, $css, $label);
            }
        }

        $elementor_kit_id = (int) get_option('elementor_active_kit', 0);
        if ($elementor_kit_id > 0) {
            $kit_settings = get_post_meta($elementor_kit_id, '_elementor_page_settings', true);
            schedule_banner_collect_font_names($kit_settings, $options);
        }

        foreach (['elementor_scheme_typography', 'elementor_global_typography', 'elementor_fonts_manager_fonts'] as $option_name) {
            schedule_banner_collect_font_names(get_option($option_name), $options);
        }

        return $options;
    }
}

if (!function_exists('schedule_banner_site_timezone')) {
    function schedule_banner_site_timezone() {
        $tz = get_option('timezone_string', '');
        return !empty($tz) ? $tz : 'UTC';
    }
}

if (!function_exists('schedule_banner_is_local_app')) {
    function schedule_banner_is_local_app($app) {
        return strpos($app, 'localhost') !== false
            || strpos($app, '127.0.0.1') !== false
            || strpos($app, '.local') !== false
            || strpos($app, 'host.docker.internal') !== false;
    }
}

if (!function_exists('schedule_banner_fetch_payload')) {
    function schedule_banner_fetch_payload($settings) {
        $key = schedule_banner_get_public_key();
        if (empty($key) || empty($settings['embed_id'])) return null;

        $app = rtrim(schedule_get_app_domain(), '/');
        $tz = schedule_banner_site_timezone();
        $range = isset($settings['range_mode']) && $settings['range_mode'] === 'week' ? 'week' : 'today';
        $cache_key = 'schedule_banner_last_' . md5($app . '|' . $key . '|' . $settings['embed_id'] . '|' . $tz . '|' . $range);
        $fresh_key = 'schedule_banner_fresh_' . md5($app . '|' . $key . '|' . $settings['embed_id'] . '|' . $tz . '|' . $range);
        $fresh = get_transient($fresh_key);
        if (is_array($fresh)) return $fresh;

        $url = add_query_arg([
            'apiKey'  => $key,
            'embedId' => $settings['embed_id'],
            'tz'      => $tz,
            'range'   => $range,
        ], $app . '/api/banner');

        $response = wp_remote_get($url, [
            'timeout'   => 2,
            'redirection' => 2,
            'sslverify' => !schedule_banner_is_local_app($app),
            'headers'   => [
                'Accept' => 'application/json',
            ],
        ]);

        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            $body = json_decode(wp_remote_retrieve_body($response), true);
            if (is_array($body)) {
                set_transient($fresh_key, $body, MINUTE_IN_SECONDS);
                set_transient($cache_key, $body, 10 * MINUTE_IN_SECONDS);
                return $body;
            }
        }

        $fallback = get_transient($cache_key);
        return is_array($fallback) ? $fallback : null;
    }
}

if (!function_exists('schedule_banner_item_text')) {
    function schedule_banner_item_text($item, $key) {
        return isset($item[$key]) && is_string($item[$key]) ? trim($item[$key]) : '';
    }
}

if (!function_exists('schedule_banner_render_slide_html')) {
    function schedule_banner_render_slide_html($item, $settings, $active = false, $attrs = '') {
        if (!is_array($item)) return '';
        $logo = schedule_banner_item_text($item, 'leagueLogo');
        if ($logo === '') $logo = schedule_banner_item_text($item, 'homeLogo');
        if ($logo === '') $logo = schedule_banner_item_text($item, 'awayLogo');
        $league = schedule_banner_item_text($item, 'league');
        $sport = $league !== '' ? $league : schedule_banner_item_text($item, 'sport');
        $matchup = schedule_banner_item_text($item, 'matchup');
        if ($matchup === '') $matchup = schedule_banner_item_text($item, 'label');
        if ($matchup === '') $matchup = 'Featured match';

        ob_start();
        ?>
        <div class="sb-slide<?php echo $active ? ' sb-active' : ''; ?>"<?php echo $attrs !== '' ? ' ' . $attrs : ''; ?>>
            <?php if (!empty($settings['show_logos']) && $logo !== ''): ?>
                <img class="sb-logo" src="<?php echo esc_url($logo); ?>" alt="" loading="eager" decoding="async" />
            <?php endif; ?>
            <?php if (!empty($settings['show_time']) && schedule_banner_item_text($item, 'time') !== ''): ?>
                <span class="sb-time"><?php echo esc_html(schedule_banner_item_text($item, 'time')); ?></span>
            <?php endif; ?>
            <?php if (!empty($settings['show_time']) && schedule_banner_item_text($item, 'time') !== '' && $sport !== ''): ?>
                <span class="sb-separator">&middot;</span>
            <?php endif; ?>
            <?php if ($sport !== ''): ?>
                <span class="sb-sport"><?php echo esc_html($sport); ?>:</span>
            <?php endif; ?>
            <span class="sb-matchup"><?php echo esc_html($matchup); ?></span>
        </div>
        <?php
        return trim(ob_get_clean());
    }
}

if (!function_exists('schedule_banner_render_inner_html')) {
    function schedule_banner_render_inner_html($items, $settings) {
        if (empty($items) || !is_array($items)) return '';
        $use_reel = (($settings['animation'] ?? 'slide') === 'slide') && count($items) > 1;
        ob_start();
        ?>
        <div class="sb-inner">
            <?php if (!empty($settings['prefix'])): ?>
                <div class="sb-prefix"><?php echo esc_html($settings['prefix']); ?></div>
            <?php endif; ?>
            <div class="sb-track">
                <?php if ($use_reel): ?>
                    <div class="sb-reel">
                        <?php foreach ($items as $index => $item) echo schedule_banner_render_slide_html($item, $settings, false, 'data-i="' . (int) $index . '"'); ?>
                        <?php echo schedule_banner_render_slide_html($items[0], $settings, false, 'data-i="clone" aria-hidden="true"'); ?>
                    </div>
                <?php else: ?>
                    <?php foreach ($items as $index => $item) echo schedule_banner_render_slide_html($item, $settings, $index === 0, 'data-i="' . (int) $index . '"'); ?>
                <?php endif; ?>
            </div>
        </div>
        <?php
        $inner = trim(ob_get_clean());
        if (!empty($settings['link_url'])) {
            return '<a class="sb-link" href="' . esc_url($settings['link_url']) . '">' . $inner . '</a>';
        }
        return $inner;
    }
}

if (!function_exists('schedule_banner_get_public_key')) {
    function schedule_banner_get_public_key() {
        $embed_token = get_option('schedule_embed_token', '');
        $api_key     = get_option('schedule_api_key', '');
        return !empty($embed_token) ? $embed_token : $api_key;
    }
}

if (!function_exists('schedule_banner_safe_target_id')) {
    function schedule_banner_safe_target_id($target_id, $fallback = 'sb-banner') {
        $safe = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $target_id);
        return !empty($safe) ? $safe : $fallback;
    }
}

if (!function_exists('schedule_banner_register_frontend_script')) {
    function schedule_banner_register_frontend_script() {
        if (wp_script_is('scorebar-banner', 'registered')) return;

        wp_register_script(
            'scorebar-banner',
            SCHEDULE_PLUGIN_URL . 'includes/banner-frontend.js',
            [],
            SCHEDULE_PLUGIN_VERSION,
            true
        );
    }
}

if (!function_exists('schedule_banner_enqueue_instance')) {
    function schedule_banner_enqueue_instance($settings, $target_id = 'sb-banner') {
        $key = schedule_banner_get_public_key();
        if ((empty($key) || empty($settings['embed_id'])) && empty($settings['fallback_text'])) return false;

        schedule_banner_register_frontend_script();

        $config = [
            'targetId'  => schedule_banner_safe_target_id($target_id),
            'app'       => rtrim(schedule_get_app_domain(), '/'),
            'token'     => $key,
            'embedId'   => $settings['embed_id'],
            'prefix'    => $settings['prefix'],
            'fallback'  => $settings['fallback_text'],
            'interval'  => (int) $settings['interval'],
            'refresh'   => (int) $settings['refresh_interval'],
            'animation' => $settings['animation'],
            'range'     => isset($settings['range_mode']) && $settings['range_mode'] === 'week' ? 'week' : 'today',
            'timeZone'  => schedule_banner_site_timezone(),
            'showTime'  => (int) $settings['show_time'],
            'showLogos' => 1,
            'link'      => $settings['link_url'],
        ];

        wp_add_inline_script(
            'scorebar-banner',
            'window.ScorebarBannerConfigs=window.ScorebarBannerConfigs||[];window.ScorebarBannerConfigs.push(' . wp_json_encode($config) . ');',
            'before'
        );
        wp_enqueue_script('scorebar-banner');
        return true;
    }
}

if (!function_exists('schedule_banner_render_instance')) {
    function schedule_banner_render_instance($settings, $target_id = 'sb-banner') {
        $target_id = schedule_banner_safe_target_id($target_id);
        $fixed     = ($settings['position'] === 'fixed');
        $fs        = (int) $settings['font_size'];
        $settings['show_logos'] = 1;
        $bg        = $settings['bg_color'];
        $fg        = $settings['text_color'];
        $accent    = $settings['accent_color'];
        $font      = schedule_banner_sanitize_font_stack($settings['font_family'] ?? schedule_banner_defaults()['font_family'], schedule_banner_defaults()['font_family']);
        $upper     = !empty($settings['uppercase']) ? 'uppercase' : 'none';
        $font_weight = (int) ($settings['font_weight'] ?? 700);
        $accent_weight = (int) ($settings['accent_weight'] ?? 900);
        $font_style = !empty($settings['italic']) ? 'italic' : 'normal';
        $text_decoration = schedule_banner_text_decoration_css($settings);
        $logo_height = (int) ($settings['logo_height'] ?? max(26, $fs + 14));
        $logo_max_width = (int) ($settings['logo_max_width'] ?? max(74, ($fs + 14) * 4));
        $logo_padding = (int) ($settings['logo_padding'] ?? 4);
        $logo_radius = schedule_banner_logo_radius_css($settings['logo_shape'] ?? 'rounded');
        $logo_bg = !empty($settings['logo_bg_transparent']) ? 'transparent' : ($settings['logo_bg_color'] ?? '#ffffff');
        $payload   = schedule_banner_fetch_payload($settings);
        $items     = (is_array($payload) && isset($payload['items']) && is_array($payload['items'])) ? $payload['items'] : [];
        $item_count = count($items);
        $serial    = (is_array($payload) && !empty($payload['serial'])) ? sanitize_text_field($payload['serial']) : '';
        $inner     = schedule_banner_render_inner_html($items, $settings);
        $ready     = $inner !== '';
        $fallback_animation_name = 'sb-fallback-' . preg_replace('/[^A-Za-z0-9_-]/', '', $target_id);
        $fallback_interval = max(2, (int) ($settings['interval'] ?? 5));
        $fallback_duration = $fallback_interval * max(1, $item_count);
        $fallback_window = $item_count > 1 ? (100 / $item_count) : 100;
        $fallback_motion_seconds = $item_count > 1 ? min(0.42, max(0.22, $fallback_interval * 0.22)) : 0;
        $fallback_motion_pct = $item_count > 1 ? max(1, min($fallback_window / 2, ($fallback_motion_seconds / $fallback_duration) * 100)) : 0;
        $fallback_visible_start = $item_count > 1 ? $fallback_motion_pct : 0;
        $fallback_visible_end = $item_count > 1 ? max($fallback_visible_start, $fallback_window - $fallback_motion_pct) : 100;
        $fallback_exit_end = $item_count > 1 ? min($fallback_window, $fallback_visible_end + $fallback_motion_pct) : 100;
        $fallback_hidden_start = $item_count > 1 ? min(99.999, $fallback_exit_end + 0.001) : 100;
        $server_reel_mode = $ready && (($settings['animation'] ?? 'slide') === 'slide') && $item_count > 1;
        $pos_css   = $fixed
            ? 'position:fixed;top:0;left:0;right:0;z-index:99990;'
            : 'position:relative;';
        ?>
<style id="<?php echo esc_attr($target_id); ?>-style">
    #<?php echo esc_attr($target_id); ?>{<?php echo $pos_css; ?>width:100%;background:<?php echo esc_attr($bg); ?>;color:<?php echo esc_attr($fg); ?>;font-family:<?php echo $font; ?>;font-size:<?php echo $fs; ?>px;font-style:<?php echo esc_attr($font_style); ?>;line-height:1.2;overflow:hidden;display:none}
#<?php echo esc_attr($target_id); ?>.sb-ready{display:block}
#<?php echo esc_attr($target_id); ?> .sb-inner{display:flex;align-items:center;min-height:<?php echo max(34, $fs + 22); ?>px;background:<?php echo esc_attr($bg); ?>;padding:4px 0;box-sizing:border-box}
#<?php echo esc_attr($target_id); ?> .sb-prefix{flex:0 0 auto;display:flex;align-items:center;gap:8px;color:<?php echo esc_attr($accent); ?>;font-weight:<?php echo $accent_weight; ?>;letter-spacing:.04em;text-transform:<?php echo $upper; ?>;text-decoration:<?php echo esc_attr($text_decoration); ?>;padding:0 14px 0 18px;white-space:nowrap}
#<?php echo esc_attr($target_id); ?> .sb-track{position:relative;flex:1 1 auto;align-self:stretch;min-width:0;overflow:hidden}
#<?php echo esc_attr($target_id); ?> .sb-slide{position:absolute;inset:0;display:flex;align-items:center;gap:9px;padding:0 16px 0 4px;white-space:nowrap;text-transform:<?php echo $upper; ?>;font-weight:<?php echo $font_weight; ?>;text-decoration:<?php echo esc_attr($text_decoration); ?>;letter-spacing:.02em;opacity:0;pointer-events:none;will-change:transform}
#<?php echo esc_attr($target_id); ?> .sb-slide.sb-active{opacity:1;pointer-events:auto}
#<?php echo esc_attr($target_id); ?> .sb-time,#<?php echo esc_attr($target_id); ?> .sb-sport{font-weight:<?php echo $accent_weight; ?>;color:<?php echo esc_attr($accent); ?>}
#<?php echo esc_attr($target_id); ?> .sb-separator{color:<?php echo esc_attr($accent); ?>;opacity:.75}
#<?php echo esc_attr($target_id); ?> .sb-matchup{color:<?php echo esc_attr($fg); ?>}
#<?php echo esc_attr($target_id); ?> .sb-round{color:<?php echo esc_attr($fg); ?>;opacity:.75}
#<?php echo esc_attr($target_id); ?> .sb-logo{height:<?php echo $logo_height; ?>px;width:auto;max-width:<?php echo $logo_max_width; ?>px;object-fit:contain;vertical-align:middle;flex:0 0 auto;background:<?php echo esc_attr($logo_bg); ?>;border-radius:<?php echo esc_attr($logo_radius); ?>;padding:<?php echo $logo_padding; ?>px;box-sizing:border-box}
#<?php echo esc_attr($target_id); ?>.sb-anim-slide .sb-slide{transform:translateY(100%);transition:transform .32s cubic-bezier(.2,.85,.2,1)}
#<?php echo esc_attr($target_id); ?>.sb-anim-slide .sb-slide.sb-active{transform:translateY(0)}
#<?php echo esc_attr($target_id); ?>.sb-anim-slide .sb-slide.sb-leaving{transform:translateY(-100%);opacity:1}
#<?php echo esc_attr($target_id); ?>.sb-anim-fade .sb-slide{transition:opacity .5s ease}
#<?php echo esc_attr($target_id); ?>.sb-reel-mode .sb-track{overflow:hidden}
#<?php echo esc_attr($target_id); ?>.sb-reel-mode .sb-reel{position:absolute;top:0;left:0;right:0;height:100%;display:block;will-change:transform}
#<?php echo esc_attr($target_id); ?>.sb-reel-mode .sb-slide{position:relative;inset:auto;opacity:1;pointer-events:auto;transform:none;transition:none;width:100%;height:100%;box-sizing:border-box}
#<?php echo esc_attr($target_id); ?> a.sb-link{color:inherit;text-decoration:none;display:block}
<?php if ($item_count > 1): ?>
@keyframes <?php echo esc_attr($fallback_animation_name); ?>-reel{<?php for ($i = 0; $i < $item_count; $i++): $start = $i * $fallback_window; $hold = (($i + 1) * $fallback_window) - $fallback_motion_pct; $end = ($i + 1) * $fallback_window; ?><?php echo esc_attr(round($start, 4)); ?>%,<?php echo esc_attr(round($hold, 4)); ?>%{transform:translateY(-<?php echo esc_attr($i * 100); ?>%)}<?php echo esc_attr(round($end, 4)); ?>%{transform:translateY(-<?php echo esc_attr(($i + 1) * 100); ?>%)}<?php endfor; ?>}
@keyframes <?php echo esc_attr($fallback_animation_name); ?>{0%{opacity:1;transform:translateY(100%)}<?php echo esc_attr(round($fallback_visible_start, 4)); ?>%,<?php echo esc_attr(round($fallback_visible_end, 4)); ?>%{opacity:1;transform:translateY(0)}<?php echo esc_attr(round($fallback_exit_end, 4)); ?>%{opacity:1;transform:translateY(-100%)}<?php echo esc_attr(round($fallback_hidden_start, 4)); ?>%{opacity:0;transform:translateY(-100%)}100%{opacity:0;transform:translateY(100%)}}
#<?php echo esc_attr($target_id); ?>.sb-reel-mode:not(.sb-js-ready) .sb-reel{animation:<?php echo esc_attr($fallback_animation_name); ?>-reel <?php echo esc_attr($fallback_duration); ?>s linear infinite}
#<?php echo esc_attr($target_id); ?>:not(.sb-reel-mode):not(.sb-js-ready) .sb-slide{animation:<?php echo esc_attr($fallback_animation_name); ?> <?php echo esc_attr($fallback_duration); ?>s linear infinite;opacity:0;transform:translateY(100%)}
<?php for ($i = 1; $i <= $item_count; $i++): ?>#<?php echo esc_attr($target_id); ?>:not(.sb-reel-mode):not(.sb-js-ready) .sb-slide:nth-child(<?php echo $i; ?>){animation-delay:<?php echo esc_attr((($i - 1) * $fallback_interval) - $fallback_motion_seconds); ?>s}
<?php endfor; ?>
<?php endif; ?>
@media (max-width:600px){#<?php echo esc_attr($target_id); ?>{font-size:<?php echo max(11, $fs - 2); ?>px}#<?php echo esc_attr($target_id); ?> .sb-prefix{padding:0 10px 0 12px}#<?php echo esc_attr($target_id); ?> .sb-slide{gap:7px;padding-right:10px}}
@media (prefers-reduced-motion:reduce){#<?php echo esc_attr($target_id); ?> .sb-slide{transition:opacity .2s linear!important;transform:none!important}}
</style>
<div id="<?php echo esc_attr($target_id); ?>" class="<?php echo trim(($ready ? 'sb-ready' : '') . ($server_reel_mode ? ' sb-reel-mode' : '')); ?>" role="region" aria-label="<?php echo esc_attr($settings['prefix']); ?>" data-fixed="<?php echo $fixed ? '1' : '0'; ?>" data-serial="<?php echo esc_attr($serial); ?>"><?php echo $inner; ?></div>
        <?php
    }
}

if (!function_exists('schedule_banner_render_color_control')) {
    function schedule_banner_render_color_control($field, $label, $value, $palette) {
        $input_id = 'sb_' . preg_replace('/[^A-Za-z0-9_-]/', '', (string) $field);
        ?>
        <div class="sb-color-card" data-sb-color-card="<?php echo esc_attr($field); ?>">
            <label for="<?php echo esc_attr($input_id); ?>" class="sb-color-title"><?php echo esc_html($label); ?></label>
            <input type="color" id="<?php echo esc_attr($input_id); ?>" name="schedule_banner[<?php echo esc_attr($field); ?>]" value="<?php echo esc_attr($value); ?>" data-sb-color="<?php echo esc_attr($field); ?>" />
            <div class="sb-swatch-grid" aria-label="Preset colors">
                <?php foreach ($palette as $color): ?>
                    <button type="button" class="sb-swatch" data-color="<?php echo esc_attr($color); ?>" style="background:<?php echo esc_attr($color); ?>" aria-label="Use <?php echo esc_attr($color); ?>"></button>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }
}

// ── Admin submenu page ───────────────────────────────────────────────────────

if (!function_exists('schedule_banner_admin_menu')) {
    function schedule_banner_admin_menu() {
        add_submenu_page(
            'scheduler-settings',
            'Banner',
            'Banner',
            'manage_options',
            'scheduler-banner',
            'schedule_banner_render_admin_page'
        );
    }
}
add_action('admin_menu', 'schedule_banner_admin_menu', 20);

if (!function_exists('schedule_banner_render_admin_page')) {
    function schedule_banner_render_admin_page() {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have sufficient permissions to access this page.'));
        }

        $saved_ok = null;
        if ('POST' === $_SERVER['REQUEST_METHOD'] && isset($_POST['schedule_banner_nonce'])) {
            if (wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['schedule_banner_nonce'])), 'schedule_banner_save')) {
                $raw = isset($_POST['schedule_banner']) && is_array($_POST['schedule_banner'])
                    ? wp_unslash($_POST['schedule_banner'])
                    : [];
                update_option('schedule_banner_settings', schedule_banner_sanitize($raw));
                $saved_ok = true;
            } else {
                $saved_ok = false;
            }
        }

        $s          = schedule_banner_get_settings();
        $api_key    = get_option('schedule_api_key', '');
        $has_token  = !empty(get_option('schedule_embed_token', '')) || !empty($api_key);
        $palette    = ['#0a0a0a', '#111827', '#1f2937', '#ffffff', '#f8fafc', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'];
        $font_weight_options = [100, 200, 300, 400, 500, 600, 700, 800, 900];
        $preview_decoration = schedule_banner_text_decoration_css($s);
        $preview_logo_radius = schedule_banner_logo_radius_css($s['logo_shape']);
        $preview_logo_bg = !empty($s['logo_bg_transparent']) ? 'transparent' : $s['logo_bg_color'];
        $font_options = schedule_banner_get_font_options();
        if (!isset($font_options[$s['font_family']])) {
            $font_options[$s['font_family']] = 'Current custom font';
        }
        $embed_options = function_exists('schedule_get_embed_instance_options')
            ? schedule_get_embed_instance_options('Choose a schedule embed')
            : ['' => 'Choose a schedule embed'];
        if (!empty($s['embed_id']) && !isset($embed_options[$s['embed_id']])) {
            $embed_options[$s['embed_id']] = $s['embed_id'] . ' (current)';
        }
        ?>
        <div class="wrap sb-banner-admin" style="max-width: 920px;">
            <h1 style="margin-bottom: 16px;">Banner</h1>

            <?php if ($saved_ok === true): ?>
                <div class="notice notice-success inline"><p>Banner settings saved.</p></div>
            <?php elseif ($saved_ok === false): ?>
                <div class="notice notice-error inline"><p>Security verification failed. Please refresh and try again.</p></div>
            <?php endif; ?>

            <?php if (!$has_token): ?>
                <div class="notice notice-warning inline"><p>Connect your account on the <a href="<?php echo esc_url(admin_url('admin.php?page=scheduler-settings')); ?>">Scheduler settings page</a> first — the banner needs the embed token to load highlights.</p></div>
            <?php endif; ?>

            <p class="sb-banner-intro">Shows a slim promo bar above your site header that rotates through the <strong>starred (highlighted)</strong> matches of the schedule embed you choose below. Star matches in your Scheduler dashboard, publish to this embed, and the banner refreshes automatically.</p>

            <style>
            .sb-banner-admin .sb-banner-intro{color:#50575e;margin:0 0 18px;max-width:760px}
            .sb-banner-form{background:#fff;border:1px solid #c3c4c7;border-radius:8px;padding:22px 26px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
            .sb-banner-preview{display:flex;align-items:center;gap:12px;overflow:hidden;border-radius:6px;margin:0 0 18px;background:<?php echo esc_attr($s['bg_color']); ?>;color:<?php echo esc_attr($s['text_color']); ?>;font-family:<?php echo schedule_banner_sanitize_font_stack($s['font_family'], schedule_banner_defaults()['font_family']); ?>;font-size:<?php echo (int) $s['font_size']; ?>px;font-style:<?php echo !empty($s['italic']) ? 'italic' : 'normal'; ?>;line-height:1.2;min-height:44px;padding:4px 16px;text-transform:<?php echo !empty($s['uppercase']) ? 'uppercase' : 'none'; ?>;text-decoration:<?php echo esc_attr($preview_decoration); ?>}
            .sb-banner-preview-prefix{display:flex;align-items:center;color:<?php echo esc_attr($s['accent_color']); ?>;font-weight:<?php echo (int) $s['accent_weight']; ?>;white-space:nowrap}
            .sb-banner-preview-logo{display:inline-flex;align-items:center;justify-content:center;min-width:<?php echo (int) $s['logo_height']; ?>px;height:<?php echo (int) $s['logo_height']; ?>px;max-width:<?php echo (int) $s['logo_max_width']; ?>px;border-radius:<?php echo esc_attr($preview_logo_radius); ?>;background:<?php echo esc_attr($preview_logo_bg); ?>;color:<?php echo esc_attr($s['accent_color']); ?>;font-size:10px;font-style:normal;font-weight:<?php echo (int) $s['accent_weight']; ?>;text-decoration:none;line-height:1;flex:0 0 auto;padding:<?php echo (int) $s['logo_padding']; ?>px;box-sizing:border-box;border:1px solid rgba(0,0,0,.08)}
            .sb-banner-preview-logo img{display:block;width:auto;height:100%;max-width:100%;object-fit:contain}
            .sb-banner-preview-text{display:flex;align-items:center;gap:8px;font-weight:<?php echo (int) $s['font_weight']; ?>;white-space:nowrap;min-width:0}
            .sb-banner-preview-accent{color:<?php echo esc_attr($s['accent_color']); ?>;font-weight:<?php echo (int) $s['accent_weight']; ?>}
            .sb-color-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;max-width:760px}
            .sb-color-card{border:1px solid #dcdcde;border-radius:8px;padding:12px;background:#f6f7f7}
            .sb-color-title{display:block;font-weight:600;margin-bottom:8px;color:#1d2327}
            .sb-color-card input[type=color]{width:100%;height:42px;border:1px solid #c3c4c7;border-radius:6px;padding:3px;background:#fff;cursor:pointer}
            .sb-swatch-grid{display:grid;grid-template-columns:repeat(6,22px);gap:6px;margin-top:10px}
            .sb-swatch{width:22px;height:22px;border-radius:999px;border:1px solid rgba(0,0,0,.18);cursor:pointer;padding:0}
            .sb-swatch:focus{outline:2px solid #2271b1;outline-offset:2px}
            .sb-inline-control{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
            .sb-inline-control input[type=range]{width:180px}
            .sb-compact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;max-width:760px}
            .sb-compact-grid label{display:block;font-weight:600;margin-bottom:4px;color:#1d2327}
            @media (max-width:782px){.sb-color-row{grid-template-columns:1fr}.sb-banner-preview{display:block}.sb-banner-preview-prefix,.sb-banner-preview-text{min-height:38px}}
            </style>

            <form method="post" action="" class="sb-banner-form">
                <?php wp_nonce_field('schedule_banner_save', 'schedule_banner_nonce'); ?>
                <div class="sb-banner-preview" id="sb-banner-preview" aria-hidden="true">
                    <div class="sb-banner-preview-prefix" id="sb-banner-preview-prefix"><?php echo esc_html($s['prefix']); ?></div>
                    <span class="sb-banner-preview-logo" id="sb-banner-preview-logo">MLB</span>
                    <div class="sb-banner-preview-text" id="sb-banner-preview-text"><span class="sb-banner-preview-accent" id="sb-banner-preview-time">8:00 PM</span><span class="sb-banner-preview-accent" id="sb-banner-preview-separator">&middot;</span><span class="sb-banner-preview-accent" id="sb-banner-preview-league">MLB:</span><span id="sb-banner-preview-matchup">Jays vs Baltimore</span></div>
                </div>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">Enable banner</th>
                        <td>
                            <label><input type="checkbox" name="schedule_banner[enabled]" value="1" <?php checked($s['enabled'], 1); ?> /> Show the banner on the front end</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_embed_id">Schedule embed</label></th>
                        <td>
                            <select id="sb_embed_id" name="schedule_banner[embed_id]" class="regular-text">
                                <?php foreach ($embed_options as $value => $label): ?>
                                    <option value="<?php echo esc_attr($value); ?>" <?php selected($s['embed_id'], $value); ?>><?php echo esc_html($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description">Choose the same schedule embed you publish to in the Scheduler app. Refresh this page after creating or renaming embeds.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_prefix">Prefix text</label></th>
                        <td>
                            <input type="text" id="sb_prefix" name="schedule_banner[prefix]" value="<?php echo esc_attr($s['prefix']); ?>" class="regular-text" />
                            <p class="description">Static label shown before the matches, e.g. <em>What&rsquo;s on tonight?</em></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_range_mode">Match window</label></th>
                        <td>
                            <select id="sb_range_mode" name="schedule_banner[range_mode]">
                                <option value="today" <?php selected($s['range_mode'], 'today'); ?>>Today only</option>
                                <option value="week" <?php selected($s['range_mode'], 'week'); ?>>This week (Monday to Sunday)</option>
                            </select>
                            <p class="description">Choose whether the banner rotates highlighted matches for today or for the current Monday-Sunday week.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_fallback_text">Fallback text</label></th>
                        <td>
                            <input type="text" id="sb_fallback_text" name="schedule_banner[fallback_text]" value="<?php echo esc_attr($s['fallback_text']); ?>" class="regular-text" />
                            <p class="description">Shown when the selected schedule has no highlighted matches yet.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Colors</th>
                        <td>
                            <div class="sb-color-row">
                                <?php schedule_banner_render_color_control('bg_color', 'Background', $s['bg_color'], $palette); ?>
                                <?php schedule_banner_render_color_control('text_color', 'Text', $s['text_color'], $palette); ?>
                                <?php schedule_banner_render_color_control('accent_color', 'Accent text', $s['accent_color'], $palette); ?>
                            </div>
                            <p class="description">Click a color pad or choose a preset. Accent controls the prefix, time, and sport text.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_font_size">Text size (px)</label></th>
                        <td>
                            <div class="sb-inline-control">
                                <input type="range" id="sb_font_size_range" value="<?php echo esc_attr($s['font_size']); ?>" min="10" max="40" step="1" data-sync-number="sb_font_size" />
                                <input type="number" id="sb_font_size" name="schedule_banner[font_size]" value="<?php echo esc_attr($s['font_size']); ?>" min="10" max="40" step="1" style="width:76px;" />
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_font_family">Font</label></th>
                        <td>
                            <select id="sb_font_family" name="schedule_banner[font_family]" class="regular-text">
                                <?php foreach ($font_options as $value => $label): ?>
                                    <option value="<?php echo esc_attr($value); ?>" <?php selected($s['font_family'], $value); ?>><?php echo esc_html($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description">Includes theme inheritance, common web fonts, WordPress Font Library families, Elementor custom fonts, and common custom font plugin entries when those plugins expose fonts in WordPress.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Typography</th>
                        <td>
                            <div class="sb-compact-grid">
                                <div>
                                    <label for="sb_font_weight">Match text weight</label>
                                    <select id="sb_font_weight" name="schedule_banner[font_weight]">
                                        <?php foreach ($font_weight_options as $weight): ?>
                                            <option value="<?php echo esc_attr($weight); ?>" <?php selected((int) $s['font_weight'], $weight); ?>><?php echo esc_html($weight); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                                <div>
                                    <label for="sb_accent_weight">Prefix/time/league weight</label>
                                    <select id="sb_accent_weight" name="schedule_banner[accent_weight]">
                                        <?php foreach ($font_weight_options as $weight): ?>
                                            <option value="<?php echo esc_attr($weight); ?>" <?php selected((int) $s['accent_weight'], $weight); ?>><?php echo esc_html($weight); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                            </div>
                            <label style="display:block;margin-top:10px;"><input type="checkbox" id="sb_italic" name="schedule_banner[italic]" value="1" <?php checked($s['italic'], 1); ?> /> Italic</label>
                            <label style="display:block;margin-top:6px;"><input type="checkbox" id="sb_underline" name="schedule_banner[underline]" value="1" <?php checked($s['underline'], 1); ?> /> Underline</label>
                            <label style="display:block;margin-top:6px;"><input type="checkbox" id="sb_strikethrough" name="schedule_banner[strikethrough]" value="1" <?php checked($s['strikethrough'], 1); ?> /> Strikethrough</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">League logo</th>
                        <td>
                            <div class="sb-compact-grid">
                                <div>
                                    <label for="sb_logo_shape">Shape</label>
                                    <select id="sb_logo_shape" name="schedule_banner[logo_shape]">
                                        <option value="square" <?php selected($s['logo_shape'], 'square'); ?>>Square</option>
                                        <option value="rounded" <?php selected($s['logo_shape'], 'rounded'); ?>>Rounded</option>
                                        <option value="pill" <?php selected($s['logo_shape'], 'pill'); ?>>Round / pill</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="sb_logo_bg_color">Logo background</label>
                                    <input type="color" id="sb_logo_bg_color" name="schedule_banner[logo_bg_color]" value="<?php echo esc_attr($s['logo_bg_color']); ?>" data-sb-color="logo_bg_color" />
                                    <label style="display:block;margin-top:6px;font-weight:400;"><input type="checkbox" id="sb_logo_bg_transparent" name="schedule_banner[logo_bg_transparent]" value="1" <?php checked($s['logo_bg_transparent'], 1); ?> /> Transparent background</label>
                                </div>
                                <div>
                                    <label for="sb_logo_height">Height (px)</label>
                                    <div class="sb-inline-control">
                                        <input type="range" id="sb_logo_height_range" value="<?php echo esc_attr($s['logo_height']); ?>" min="16" max="80" step="1" data-sync-number="sb_logo_height" />
                                        <input type="number" id="sb_logo_height" name="schedule_banner[logo_height]" value="<?php echo esc_attr($s['logo_height']); ?>" min="16" max="80" step="1" style="width:76px;" />
                                    </div>
                                </div>
                                <div>
                                    <label for="sb_logo_max_width">Max width (px)</label>
                                    <div class="sb-inline-control">
                                        <input type="range" id="sb_logo_max_width_range" value="<?php echo esc_attr($s['logo_max_width']); ?>" min="32" max="260" step="1" data-sync-number="sb_logo_max_width" />
                                        <input type="number" id="sb_logo_max_width" name="schedule_banner[logo_max_width]" value="<?php echo esc_attr($s['logo_max_width']); ?>" min="32" max="260" step="1" style="width:76px;" />
                                    </div>
                                </div>
                                <div>
                                    <label for="sb_logo_padding">Padding (px)</label>
                                    <div class="sb-inline-control">
                                        <input type="range" id="sb_logo_padding_range" value="<?php echo esc_attr($s['logo_padding']); ?>" min="0" max="20" step="1" data-sync-number="sb_logo_padding" />
                                        <input type="number" id="sb_logo_padding" name="schedule_banner[logo_padding]" value="<?php echo esc_attr($s['logo_padding']); ?>" min="0" max="20" step="1" style="width:76px;" />
                                    </div>
                                </div>
                            </div>
                            <p class="description">Controls the highlighted league logo chip in the live banner and in this preview.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_animation">Animation</label></th>
                        <td>
                            <select id="sb_animation" name="schedule_banner[animation]">
                                <option value="slide" <?php selected($s['animation'], 'slide'); ?>>Slide</option>
                                <option value="fade" <?php selected($s['animation'], 'fade'); ?>>Fade</option>
                            </select>
                            <label style="margin-left:18px;">Speed <input type="number" id="sb_interval" name="schedule_banner[interval]" value="<?php echo esc_attr($s['interval']); ?>" min="2" max="30" step="1" style="width:64px;" /> sec between matches</label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_refresh_interval">Live refresh</label></th>
                        <td>
                            <input type="number" id="sb_refresh_interval" name="schedule_banner[refresh_interval]" value="<?php echo esc_attr($s['refresh_interval']); ?>" min="30" max="300" step="1" style="width:76px;" /> seconds
                            <p class="description">Checks the selected embed for newly published highlights. The banner also refreshes immediately when a visitor returns to the tab.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_position">Position</label></th>
                        <td>
                            <select id="sb_position" name="schedule_banner[position]">
                                <option value="static" <?php selected($s['position'], 'static'); ?>>Push content down (in flow)</option>
                                <option value="fixed" <?php selected($s['position'], 'fixed'); ?>>Fixed (stays on top while scrolling)</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Display</th>
                        <td>
                            <label style="display:block;margin-bottom:6px;"><input type="checkbox" id="sb_uppercase" name="schedule_banner[uppercase]" value="1" <?php checked($s['uppercase'], 1); ?> /> Uppercase text</label>
                            <label style="display:block;margin-bottom:6px;"><input type="checkbox" id="sb_show_time" name="schedule_banner[show_time]" value="1" <?php checked($s['show_time'], 1); ?> /> Show kick-off time</label>
                            <p class="description" style="margin-top:6px;">League logos are always shown for highlighted matches.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="sb_link">Link (optional)</label></th>
                        <td>
                            <input type="url" id="sb_link" name="schedule_banner[link_url]" value="<?php echo esc_attr($s['link_url']); ?>" class="regular-text" placeholder="https://…" />
                            <p class="description">Makes the whole banner clickable, e.g. to your full schedule page.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button('Save Banner Settings'); ?>
            </form>
        </div>
        <script>
        (function(){
            var preview = document.getElementById('sb-banner-preview');
            var prefix = document.getElementById('sb-banner-preview-prefix');
            var logo = document.getElementById('sb-banner-preview-logo');
            var text = document.getElementById('sb-banner-preview-text');
            var time = document.getElementById('sb-banner-preview-time');
            var separator = document.getElementById('sb-banner-preview-separator');
            var league = document.getElementById('sb-banner-preview-league');
            var matchup = document.getElementById('sb-banner-preview-matchup');
            var embedSelect = document.getElementById('sb_embed_id');
            var rangeMode = document.getElementById('sb_range_mode');
            var intervalInput = document.getElementById('sb_interval');
            var prefixInput = document.getElementById('sb_prefix');
            var fontNumber = document.getElementById('sb_font_size');
            var fontRange = document.getElementById('sb_font_size_range');
            var fontFamily = document.getElementById('sb_font_family');
            var fontWeight = document.getElementById('sb_font_weight');
            var accentWeight = document.getElementById('sb_accent_weight');
            var uppercase = document.getElementById('sb_uppercase');
            var showTime = document.getElementById('sb_show_time');
            var italic = document.getElementById('sb_italic');
            var underline = document.getElementById('sb_underline');
            var strikethrough = document.getElementById('sb_strikethrough');
            var logoShape = document.getElementById('sb_logo_shape');
            var logoTransparent = document.getElementById('sb_logo_bg_transparent');
            var logoHeight = document.getElementById('sb_logo_height');
            var logoHeightRange = document.getElementById('sb_logo_height_range');
            var logoMaxWidth = document.getElementById('sb_logo_max_width');
            var logoMaxWidthRange = document.getElementById('sb_logo_max_width_range');
            var logoPadding = document.getElementById('sb_logo_padding');
            var logoPaddingRange = document.getElementById('sb_logo_padding_range');
            var previewConfig = <?php echo wp_json_encode([
                'app' => rtrim(schedule_get_app_domain(), '/'),
                'token' => schedule_banner_get_public_key(),
                'timeZone' => schedule_banner_site_timezone(),
            ], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT); ?>;
            var previewItems = [];
            var previewIndex = 0;
            var previewTimer = null;
            var previewRequestId = 0;

            function getColor(name) {
                var input = document.querySelector('[data-sb-color="' + name + '"]');
                return input ? input.value : '';
            }

            function logoRadius(shape) {
                if (shape === 'square') return '0';
                if (shape === 'pill') return '999px';
                return '6px';
            }

            function syncNumberPair(range, number) {
                if (!range || !number) return;
                range.addEventListener('input', function() {
                    number.value = range.value;
                    syncPreview();
                });
                number.addEventListener('input', function() {
                    range.value = number.value;
                    syncPreview();
                });
            }

            function textDecorationValue() {
                var decorations = [];
                if (underline && underline.checked) decorations.push('underline');
                if (strikethrough && strikethrough.checked) decorations.push('line-through');
                return decorations.length ? decorations.join(' ') : 'none';
            }

            function placeholderItem() {
                return { league: 'MLB', sport: 'MLB', matchup: 'Jays vs Baltimore', time: '8:00 PM', leagueLogo: '', homeLogo: '', awayLogo: '', isPlaceholder: true };
            }

            function logoText(item) {
                var label = (item && (item.league || item.sport)) || 'MLB';
                return label.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).map(function(part) { return part.charAt(0); }).join('').substring(0, 4) || 'MLB';
            }

            function renderPreviewItem(item) {
                item = item || placeholderItem();
                var logoUrl = item.leagueLogo || item.homeLogo || item.awayLogo || '';
                var leagueText = item.league || item.sport || '';
                var matchupText = item.matchup || item.label || 'Featured match';
                var timeText = item.time || '';

                if (preview) preview.setAttribute('data-has-time', timeText ? '1' : '0');

                if (logo) {
                    if (logoUrl) {
                        logo.textContent = '';
                        var img = document.createElement('img');
                        img.src = logoUrl;
                        img.alt = '';
                        img.loading = 'eager';
                        img.decoding = 'async';
                        img.onerror = function() { logo.textContent = logoText(item); };
                        logo.appendChild(img);
                    } else {
                        logo.textContent = logoText(item);
                    }
                }
                if (time) time.textContent = timeText;
                if (league) {
                    league.textContent = leagueText ? leagueText + ':' : 'MLB:';
                    league.style.display = leagueText || !logoUrl ? '' : 'none';
                }
                if (matchup) matchup.textContent = matchupText || 'Jays vs Baltimore';
                syncPreview();
            }

            function stopPreviewRotation() {
                if (previewTimer) {
                    clearInterval(previewTimer);
                    previewTimer = null;
                }
            }

            function startPreviewRotation() {
                stopPreviewRotation();
                if (!previewItems || previewItems.length < 2) return;
                var seconds = Math.max(2, Math.min(30, parseInt(intervalInput && intervalInput.value, 10) || 5));
                previewTimer = setInterval(function() {
                    previewIndex = (previewIndex + 1) % previewItems.length;
                    renderPreviewItem(previewItems[previewIndex]);
                }, seconds * 1000);
            }

            function setPreviewItems(items) {
                previewItems = items && items.length ? items : [placeholderItem()];
                previewIndex = 0;
                renderPreviewItem(previewItems[previewIndex]);
                startPreviewRotation();
            }

            function loadPublishedPreview() {
                var embedId = embedSelect && embedSelect.value ? embedSelect.value.trim() : '';
                if (!previewConfig || !previewConfig.app || !previewConfig.token || !embedId) {
                    setPreviewItems([]);
                    return;
                }

                var requestId = ++previewRequestId;
                var url = previewConfig.app + '/api/banner?apiKey=' + encodeURIComponent(previewConfig.token) +
                    '&embedId=' + encodeURIComponent(embedId) +
                    '&tz=' + encodeURIComponent(previewConfig.timeZone || '') +
                    '&range=' + encodeURIComponent(rangeMode && rangeMode.value === 'week' ? 'week' : 'today') +
                    '&_=' + Date.now();

                fetch(url, { credentials: 'omit', cache: 'no-store' })
                    .then(function(response) { return response.ok ? response.json() : null; })
                    .then(function(data) {
                        if (requestId !== previewRequestId) return;
                        var items = data && Array.isArray(data.items) ? data.items : [];
                        setPreviewItems(items);
                    })
                    .catch(function() {
                        if (requestId === previewRequestId) setPreviewItems([]);
                    });
            }

            function syncPreview() {
                if (!preview) return;
                var bg = getColor('bg_color');
                var fg = getColor('text_color');
                var accent = getColor('accent_color');
                var logoBg = getColor('logo_bg_color');
                if (bg) preview.style.backgroundColor = bg;
                if (fg) preview.style.color = fg;
                if (accent && prefix) prefix.style.color = accent;
                if (accent) {
                    preview.querySelectorAll('.sb-banner-preview-accent').forEach(function(el) { el.style.color = accent; });
                }
                if (prefix && prefixInput) prefix.textContent = prefixInput.value || 'Banner';
                if (fontNumber) preview.style.fontSize = fontNumber.value + 'px';
                if (fontFamily) preview.style.fontFamily = fontFamily.value || 'inherit';
                preview.style.textTransform = uppercase && uppercase.checked ? 'uppercase' : 'none';
                preview.style.fontStyle = italic && italic.checked ? 'italic' : 'normal';
                preview.style.textDecoration = textDecorationValue();
                if (text && fontWeight) text.style.fontWeight = fontWeight.value || '700';
                if (prefix && accentWeight) prefix.style.fontWeight = accentWeight.value || '900';
                if (accentWeight) {
                    preview.querySelectorAll('.sb-banner-preview-accent').forEach(function(el) { el.style.fontWeight = accentWeight.value || '900'; });
                }
                var hasTime = !preview || preview.getAttribute('data-has-time') !== '0';
                var showTimeValue = !(showTime && !showTime.checked) && hasTime;
                if (time) time.style.display = showTimeValue ? '' : 'none';
                if (separator) separator.style.display = showTimeValue ? '' : 'none';
                if (logo) {
                    var h = logoHeight ? logoHeight.value : '29';
                    logo.style.height = h + 'px';
                    logo.style.minWidth = h + 'px';
                    logo.style.maxWidth = (logoMaxWidth ? logoMaxWidth.value : '116') + 'px';
                    logo.style.padding = (logoPadding ? logoPadding.value : '4') + 'px';
                    logo.style.borderRadius = logoRadius(logoShape ? logoShape.value : 'rounded');
                    logo.style.backgroundColor = logoTransparent && logoTransparent.checked ? 'transparent' : (logoBg || '#ffffff');
                    if (accent) logo.style.color = accent;
                }
            }

            document.querySelectorAll('.sb-swatch').forEach(function(button) {
                button.addEventListener('click', function() {
                    var card = button.closest('[data-sb-color-card]');
                    if (!card) return;
                    var input = card.querySelector('input[type="color"]');
                    if (!input) return;
                    input.value = button.getAttribute('data-color') || input.value;
                    syncPreview();
                });
            });
            document.querySelectorAll('[data-sb-color]').forEach(function(input) {
                input.addEventListener('input', syncPreview);
            });
            if (prefixInput) prefixInput.addEventListener('input', syncPreview);
            if (fontFamily) fontFamily.addEventListener('change', syncPreview);
            if (embedSelect) embedSelect.addEventListener('change', loadPublishedPreview);
            if (rangeMode) rangeMode.addEventListener('change', loadPublishedPreview);
            if (intervalInput) {
                intervalInput.addEventListener('input', startPreviewRotation);
                intervalInput.addEventListener('change', startPreviewRotation);
            }
            [fontWeight, accentWeight, uppercase, showTime, italic, underline, strikethrough, logoShape, logoTransparent].forEach(function(input) {
                if (!input) return;
                input.addEventListener('change', syncPreview);
                input.addEventListener('input', syncPreview);
            });
            syncNumberPair(fontRange, fontNumber);
            syncNumberPair(logoHeightRange, logoHeight);
            syncNumberPair(logoMaxWidthRange, logoMaxWidth);
            syncNumberPair(logoPaddingRange, logoPadding);
            syncPreview();
            loadPublishedPreview();
        })();
        </script>
        <?php
    }
}

// ── Front-end render ─────────────────────────────────────────────────────────

if (!function_exists('schedule_banner_should_render')) {
    function schedule_banner_should_render() {
        if (is_admin()) return false;
        $s = schedule_banner_get_settings();
        if (empty($s['enabled'])) return false;
        $key = schedule_banner_get_public_key();
        if ((empty($key) || empty($s['embed_id'])) && empty($s['fallback_text'])) return false;
        return true;
    }
}

if (!function_exists('schedule_banner_enqueue')) {
    function schedule_banner_enqueue() {
        if (!schedule_banner_should_render()) return;

        schedule_banner_enqueue_instance(schedule_banner_get_settings(), 'sb-banner');
    }
}
add_action('wp_enqueue_scripts', 'schedule_banner_enqueue');

if (!function_exists('schedule_banner_render')) {
    function schedule_banner_render() {
        if (!schedule_banner_should_render()) return;

        schedule_banner_render_instance(schedule_banner_get_settings(), 'sb-banner');
        $GLOBALS['schedule_banner_rendered'] = true;
    }
}
add_action('wp_body_open', 'schedule_banner_render', 1);

if (!function_exists('schedule_banner_render_footer_fallback')) {
    function schedule_banner_render_footer_fallback() {
        if (!schedule_banner_should_render()) return;
        if (!empty($GLOBALS['schedule_banner_rendered'])) return;

        schedule_banner_render_instance(schedule_banner_get_settings(), 'sb-banner');
        ?>
        <script>
        (function(){
            var banner = document.getElementById('sb-banner');
            if (!banner || !document.body) return;
            document.body.insertBefore(banner, document.body.firstChild);
            var style = document.getElementById('sb-banner-style');
            if (style && document.head) document.head.appendChild(style);
        })();
        </script>
        <?php
    }
}
add_action('wp_footer', 'schedule_banner_render_footer_fallback', 1);
