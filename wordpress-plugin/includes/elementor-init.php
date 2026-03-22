<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('schedule_register_elementor_categories')) {
function schedule_register_elementor_categories($elements_manager) {
    $elements_manager->add_category('schedule-category', ['title' => 'Scheduler', 'icon' => 'fa fa-calendar']);
}
}
add_action('elementor/elements/categories_registered', 'schedule_register_elementor_categories');

if (!function_exists('schedule_register_elementor_widgets')) {
function schedule_register_elementor_widgets($widgets_manager) {
    if ( ! class_exists( '\Elementor\Widget_Base' ) ) return;
    require_once(__DIR__ . '/elementor-widget.php');
    if ( class_exists('\Schedule_Elementor_Widget') ) {
        $widgets_manager->register(new \Schedule_Elementor_Widget());
    }
}
}
add_action('elementor/widgets/register', 'schedule_register_elementor_widgets');

if (!function_exists('schedule_sync_deleted_widgets')) {
function schedule_sync_deleted_widgets($post_id, $editor_data) {
    // Get auth credentials
    $api_key     = get_option('schedule_api_key', '');
    $embed_token = get_option('schedule_embed_token', '');
    $key         = !empty($embed_token) ? $embed_token : $api_key;
    if (empty($key)) return;

    $app = rtrim(schedule_get_app_domain(), '/');
    if (empty($app)) return;
    $is_local = (
        strpos($app, 'localhost') !== false ||
        strpos($app, '127.0.0.1') !== false ||
        strpos($app, '.local') !== false ||
        (defined('WP_ENVIRONMENT_TYPE') &&
            in_array(WP_ENVIRONMENT_TYPE, ['local', 'development'], true))
    );

    // ── Step 1: Collect all schedule_widget IDs still on the page ──────
    // Walk the full nested element tree. Elementor uses:
    //   Old layout: document → sections → columns → widgets
    //   New layout: document → containers → widgets (or nested containers)
    // The recursive walker handles both.
    $current_ids = [];
    schedule_collect_widget_ids($editor_data, $current_ids);

    // ── Step 2: Fetch all stored instances for this user from Supabase ──
    $get_response = wp_remote_get(
        $app . '/api/embed-instances?apiKey=' . urlencode($key),
        ['timeout' => 10, 'sslverify' => !$is_local]
    );

    if (is_wp_error($get_response)) {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[Scheduler] save-sync GET failed: '
                . $get_response->get_error_message());
        }
        return;
    }

    $body      = json_decode(wp_remote_retrieve_body($get_response), true);
    $instances = $body['instances'] ?? [];

    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[Scheduler] save-sync post=' . $post_id
            . ' current_widget_ids=' . implode(',', $current_ids)
            . ' stored_instances=' . count($instances));
    }

    // ── Step 3: DELETE any stored instance whose widget_id is gone ──────
    foreach ($instances as $instance) {
        $stored_widget_id = $instance['widget_id'] ?? null;

        // Skip shortcode-based embeds (no widget_id) — they have
        // no Elementor context and are managed separately
        if (empty($stored_widget_id)) continue;

        // If the widget_id is no longer anywhere in the saved page,
        // it was deleted — tell Supabase to remove it
        if (!in_array($stored_widget_id, $current_ids, true)) {
            $delete_url = $app . '/api/embed-instances?'
                . http_build_query([
                    'apiKey'   => $key,
                    'widgetId' => $stored_widget_id,
                ]);

            $del_response = wp_remote_request($delete_url, [
                'method'    => 'DELETE',
                'timeout'   => 10,
                'blocking'  => true,
                'sslverify' => !$is_local,
            ]);

            if (defined('WP_DEBUG') && WP_DEBUG) {
                $code = is_wp_error($del_response)
                    ? $del_response->get_error_message()
                    : wp_remote_retrieve_response_code($del_response);
                error_log('[Scheduler] save-sync DELETE widgetId='
                    . $stored_widget_id . ' response=' . $code);
            }
        }
    }
}
}

add_action('elementor/editor/after_save',
    'schedule_sync_deleted_widgets', 10, 2);

// Recursively walks Elementor's nested element tree and collects
// all schedule_widget element IDs. Works for both the legacy
// section→column→widget structure and the new container structure.
if (!function_exists('schedule_collect_widget_ids')) {
function schedule_collect_widget_ids($elements, &$ids) {
    if (!is_array($elements)) return;
    foreach ($elements as $element) {
        if (!is_array($element)) continue;

        // Check if this element IS our widget
        $widget_type = $element['widgetType'] ?? '';
        $el_type     = $element['elType']     ?? '';
        if ($el_type === 'widget' && $widget_type === 'schedule_widget') {
            if (!empty($element['id'])) {
                $ids[] = $element['id'];
            }
        }

        // Always recurse into children regardless of element type
        // (sections have columns, columns have widgets,
        //  containers can have containers or widgets)
        if (!empty($element['elements']) && is_array($element['elements'])) {
            schedule_collect_widget_ids($element['elements'], $ids);
        }
    }
}
}
