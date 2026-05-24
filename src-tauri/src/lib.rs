mod activation;
mod app_info;
mod context_menu;
mod defender;
mod driver_packages;
mod driver_search;
mod driver_update;
mod files;
mod firewall;
mod icons;
mod iso_builder;
mod maintenance;
mod network;
mod onedrive;
mod recall;
mod schtasks;
pub mod sysinfo;
mod sysquery;
mod tweaks;
mod unattend;
mod winget;
mod winupdate;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            sysinfo::get_system_info,
            sysinfo::is_elevated,
            sysinfo::get_accent_color,
            sysinfo::relaunch_elevated,
            tweaks::list_installed_appx,
            tweaks::remove_appx,
            tweaks::reg_read,
            tweaks::reg_read_many,
            tweaks::reg_write,
            tweaks::reg_delete_value,
            tweaks::run_powershell,
            tweaks::create_restore_point,
            tweaks::restart_explorer,
            sysquery::get_hardware_info,
            sysquery::list_startup_apps,
            sysquery::set_startup_enabled,
            sysquery::list_services,
            sysquery::set_service,
            winupdate::search_windows_updates,
            winupdate::install_windows_updates,
            driver_search::open_driver_search,
            driver_update::lookup_nvidia_driver,
            driver_update::download_driver,
            driver_update::launch_installer,
            driver_update::reveal_in_explorer,
            network::read_hosts,
            network::write_hosts,
            network::has_hosts_backup,
            network::restore_hosts_backup,
            network::apply_blocklist,
            network::remove_blocklist,
            network::list_active_blocklists,
            network::fetch_blocklist,
            network::flush_dns,
            network::get_dns_servers,
            network::set_dns_servers,
            network::reset_dns_servers,
            network::set_doh_template,
            winget::winget_available,
            winget::winget_version,
            winget::winget_list_installed,
            winget::winget_list_upgradable,
            winget::winget_install,
            winget::winget_uninstall,
            winget::winget_upgrade,
            winget::winget_run_stream,
            maintenance::maintenance_run_stream,
            maintenance::maintenance_pty_resize,
            maintenance::maintenance_pty_kill,
            maintenance::list_power_plans,
            maintenance::set_power_plan,
            maintenance::unlock_ultimate_performance,
            maintenance::delete_power_plan,
            files::read_text_file,
            files::write_text_file,
            app_info::is_portable,
            app_info::app_data_dir,
            app_info::log_append,
            app_info::read_activity_log,
            app_info::read_app_file,
            app_info::write_app_file,
            onedrive::onedrive_detect,
            onedrive::onedrive_backup,
            onedrive::onedrive_uninstall,
            context_menu::context_menu_list,
            context_menu::context_menu_toggle,
            icons::get_file_icons,
            icons::get_appx_icons,
            icons::open_properties,
            icons::resolve_commands,
            maintenance::launch_cleanmgr,
            maintenance::launch_memory_diagnostic,
            maintenance::unblock_files_stream,
            defender::defender_status,
            defender::defender_set_setting,
            defender::defender_list_exclusions,
            defender::defender_add_exclusion,
            defender::defender_remove_exclusion,
            schtasks::list_scheduled_tasks,
            schtasks::set_scheduled_task,
            schtasks::run_scheduled_task,
            schtasks::delete_scheduled_task,
            recall::recall_status,
            recall::recall_wipe,
            firewall::firewall_list_blocks,
            firewall::firewall_apply_block,
            firewall::firewall_remove_block,
            driver_packages::list_driver_packages,
            driver_packages::delete_driver_package,
            activation::get_activation_status,
            activation::launch_activation_script,
            unattend::generate_autounattend_xml,
            unattend::save_autounattend_xml,
            unattend::list_win11_editions,
            iso_builder::iso_check_tools,
            iso_builder::iso_build,
            iso_builder::download_adk_setup,
            iso_builder::launch_adk_installer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
