/// Minimal text-file I/O for paths the user has explicitly picked via Tauri's
/// dialog plugin — used for profile export / import. We deliberately don't add
/// the full tauri-plugin-fs since these are the only paths we need.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {e}"))
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Write failed: {e}"))
}
