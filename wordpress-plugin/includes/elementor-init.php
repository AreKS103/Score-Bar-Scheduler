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
    // Walk the full nested element tree. Elementor uses:
    //   Old layout: document → sections → columns → widgets
    //   New layout: document → containers → widgets (or nested containers)
    // The recursive walker handles both.
    $current_ids = [];
    schedule_collect_widget_ids($editor_data, $current_ids);
    $current_ids = schedule_normalize_widget_ids($current_ids);
    $meta_key = '_schedule_widget_ids';

    // The first save establishes ownership for this post. There is no safe
    // previous state to diff, so never delete anything during this baseline.
    if (!metadata_exists('post', $post_id, $meta_key)) {
        update_post_meta($post_id, $meta_key, $current_ids);
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[Scheduler] save-sync baseline post=' . $post_id
                . ' widget_ids=' . implode(',', $current_ids));
        }
        return;
    }

    $previous_ids = schedule_normalize_widget_ids(
        get_post_meta($post_id, $meta_key, true)
    );
    $removed_ids = array_values(array_diff($previous_ids, $current_ids));
    $failed_ids = schedule_delete_widget_instances($removed_ids);

    // Keep failed removals in the post's state so a later save can retry.
    $tracked_ids = schedule_normalize_widget_ids(
        array_merge($current_ids, $failed_ids)
    );
    update_post_meta($post_id, $meta_key, $tracked_ids);

    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[Scheduler] save-sync post=' . $post_id
            . ' removed_widget_ids=' . implode(',', $removed_ids)
            . ' failed_widget_ids=' . implode(',', $failed_ids));
    }
}
}

add_action('elementor/editor/after_save',
    'schedule_sync_deleted_widgets', 10, 2);

if (!function_exists('schedule_normalize_widget_ids')) {
function schedule_normalize_widget_ids($ids) {
    if (!is_array($ids)) return [];

    $normalized = [];
    foreach ($ids as $id) {
        if (!is_scalar($id)) continue;
        $safe_id = substr(preg_replace('/[^\w-]/', '', (string) $id), 0, 64);
        if ($safe_id !== '') $normalized[] = $safe_id;
    }
    return array_values(array_unique($normalized));
}
}

/**
 * Delete only the supplied widget instances with the private account key.
 * Returns IDs that could not be deleted so the caller can retry later.
 */
if (!function_exists('schedule_delete_widget_instances')) {
function schedule_delete_widget_instances($widget_ids) {
    $widget_ids = schedule_normalize_widget_ids($widget_ids);
    if (empty($widget_ids)) return [];

    $api_key = get_option('schedule_api_key', '');
    if (!is_string($api_key) || strpos($api_key, 'sb_') !== 0) {
        return $widget_ids;
    }

    $app = rtrim(schedule_get_app_domain(), '/');
    if (empty($app)) return $widget_ids;

    $is_local = (
        strpos($app, 'localhost') !== false ||
        strpos($app, '127.0.0.1') !== false ||
        strpos($app, '.local') !== false ||
        (defined('WP_ENVIRONMENT_TYPE') &&
            in_array(WP_ENVIRONMENT_TYPE, ['local', 'development'], true))
    );
    $failed_ids = [];

    foreach ($widget_ids as $widget_id) {
        $delete_url = $app . '/api/embed-instances?' . http_build_query([
            'apiKey'   => $api_key,
            'widgetId' => $widget_id,
        ]);
        $response = wp_remote_request($delete_url, [
            'method'    => 'DELETE',
            'timeout'   => 10,
            'blocking'  => true,
            'sslverify' => !$is_local,
        ]);
        $status = is_wp_error($response)
            ? 0
            : wp_remote_retrieve_response_code($response);

        if ($status < 200 || $status >= 300) {
            $failed_ids[] = $widget_id;
        }
        if (defined('WP_DEBUG') && WP_DEBUG) {
            $result = is_wp_error($response)
                ? $response->get_error_message()
                : $status;
            error_log('[Scheduler] lifecycle DELETE widgetId='
                . $widget_id . ' response=' . $result);
        }
    }

    return $failed_ids;
}
}

if (!function_exists('schedule_cleanup_deleted_post')) {
function schedule_cleanup_deleted_post($post_id) {
    $meta_key = '_schedule_widget_ids';
    if (!metadata_exists('post', $post_id, $meta_key)) return;

    schedule_delete_widget_instances(
        get_post_meta($post_id, $meta_key, true)
    );
}
}
add_action('before_delete_post', 'schedule_cleanup_deleted_post');

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
