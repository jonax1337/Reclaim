mod activation;
mod app_info;
#[cfg(windows)]
pub mod cli;
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
mod service;
pub mod sysinfo;
mod sysquery;
mod tweaks;
mod unattend;
mod winget;
mod winupdate;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

pub fn run() {
    let service_state = service::ServiceState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Bring the existing instance forward when a second reclaim.exe is launched.
            service::show_main(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // --autostart is a no-op flag the launch sequence detects to skip
            // showing the window (boots straight to tray).
            Some(vec!["--autostart"]),
        ))
        .manage(service_state)
        .setup(|app| {
            // Build the tray menu first so we can wire it into the icon.
            let open_i = MenuItem::with_id(app, "tray-open", "Open Reclaim", true, None::<&str>)?;
            let check_i = MenuItem::with_id(app, "tray-check", "Check now", true, None::<&str>)?;
            let settings_i = MenuItem::with_id(app, "tray-settings", "Settings…", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "tray-quit", "Quit Reclaim", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&open_i, &sep1, &check_i, &sep2, &settings_i, &quit_i],
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().ok_or("missing default window icon")?)
                .tooltip("Reclaim Your Windows")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "tray-open" => service::show_main(app),
                    "tray-check" => {
                        service::show_main(app);
                        service::emit_trigger_check(app);
                    }
                    "tray-settings" => {
                        service::show_main(app);
                        service::emit_navigate(app, "/settings");
                    }
                    "tray-quit" => {
                        let state = app.state::<service::ServiceState>();
                        service::set_force_quit(&state);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let visible = w.is_visible().unwrap_or(false);
                            if visible {
                                let _ = w.hide();
                            } else {
                                service::show_main(app);
                            }
                        }
                    }
                })
                .build(app)?;

            // Honor --autostart flag: boot straight to tray, no flash.
            let argv: Vec<String> = std::env::args().collect();
            if argv.iter().any(|a| a == "--autostart") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            // Start the background tick loop.
            service::spawn_loop(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<service::ServiceState>();
                // If the user picked "Quit Reclaim" from the tray, let the close go through.
                if service::is_force_quit(&state) {
                    return;
                }
                if service::is_keep_in_tray(&state) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
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
            sysquery::get_power_state,
            sysquery::recent_hotfix_installed_since,
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
            service::service_set_interval,
            service::service_get_interval,
            service::service_set_keep_in_tray,
            service::service_trigger_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
