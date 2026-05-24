mod activation;
mod app_info;
#[cfg(windows)]
pub mod cli;
mod context_menu;
mod defender;
mod dev_features;
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
mod persistence;
mod recall;
mod schtasks;
mod service;
pub mod sysinfo;
mod sysquery;
mod tweaks;
mod unattend;
mod usb_flash;
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

            match TrayIconBuilder::with_id("main")
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
                .build(app)
            {
                Ok(_) => eprintln!("[reclaim] tray icon created"),
                Err(e) => eprintln!("[reclaim] tray icon creation FAILED: {e}"),
            }

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
            winupdate::install_windows_updates_stream,
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
            usb_flash::list_usb_drives,
            usb_flash::usb_flash_iso,
            service::service_set_interval,
            service::service_get_interval,
            service::service_set_keep_in_tray,
            service::service_trigger_now,
            persistence::persistence_install_task,
            persistence::persistence_uninstall_task,
            persistence::persistence_task_status,
            persistence::persistence_run_task_now,
            persistence::persistence_cleanup_legacy_tasks,
            dev_features::list_optional_features,
            dev_features::set_optional_feature_stream,
            dev_features::list_wsl_distros,
            dev_features::dev_drive_info,
        ])
        .on_window_event(|window, event| {
            // Only the Builder-global `on_window_event` handler's `prevent_close`
            // is consulted by Tauri 2's close-request decision. Per-window
            // listeners attached via `Window::on_window_event` fire too but
            // their `api.prevent_close()` call is a no-op for the actual close
            // resolution — we burned a debugging round on that. Keep this here.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                let Some(state) = app.try_state::<service::ServiceState>() else {
                    eprintln!("[reclaim] CloseRequested: ServiceState unmanaged, letting close through");
                    return;
                };
                let force = service::is_force_quit(&state);
                let keep = service::is_keep_in_tray(&state);
                eprintln!("[reclaim] CloseRequested force_quit={force} keep_in_tray={keep}");
                if force {
                    return;
                }
                if keep {
                    api.prevent_close();
                    match window.hide() {
                        Ok(_) => eprintln!("[reclaim] hidden to tray"),
                        Err(e) => eprintln!("[reclaim] hide failed: {e}"),
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Safety net for the "last window destroyed → app exits" default.
            // If anything tears the main window down (e.g. another plugin's
            // close handler winning ordering, or someone calling destroy()
            // directly), Tauri would normally exit the event loop and the
            // tray companion would die with it. `prevent_exit` keeps the
            // runtime alive so the tray icon survives — the user can re-open
            // a window from the tray "Open Reclaim" menu, which spawns a
            // fresh window if the original is gone (see service::show_main).
            // Force-quit (tray "Quit Reclaim" menu) is the only path that
            // actually allows the runtime to wind down.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let Some(state) = app_handle.try_state::<service::ServiceState>() else {
                    return;
                };
                if service::is_force_quit(&state) {
                    return;
                }
                let main_alive = app_handle.get_webview_window("main").is_some();
                eprintln!(
                    "[reclaim] ExitRequested intercepted → staying alive in tray (main_alive={main_alive})"
                );
                api.prevent_exit();
            }
        });
}
