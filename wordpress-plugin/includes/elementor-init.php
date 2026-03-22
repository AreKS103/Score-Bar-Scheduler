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
