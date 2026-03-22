<?php
if (!defined('ABSPATH')) exit;

if (!function_exists('scorebar_app_register_elementor_categories')) {
function scorebar_app_register_elementor_categories($elements_manager) {
    $elements_manager->add_category('scorebar-schedule-category', ['title' => 'Scheduler', 'icon' => 'fa fa-calendar']);
}
}
add_action('elementor/elements/categories_registered', 'scorebar_app_register_elementor_categories');

if (!function_exists('scorebar_app_register_elementor_widgets')) {
function scorebar_app_register_elementor_widgets($widgets_manager) {
    if ( ! class_exists( '\Elementor\Widget_Base' ) ) return;
    require_once(__DIR__ . '/elementor-widget.php');
    if ( class_exists('\Scorebar_App_Elementor_Widget') ) {
        $widgets_manager->register(new \Scorebar_App_Elementor_Widget());
    }
}
}
add_action('elementor/widgets/register', 'scorebar_app_register_elementor_widgets');
