mod filesystem;
mod terminal;

use std::sync::Arc;
use terminal::TerminalManager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let terminal_manager = Arc::new(TerminalManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(terminal_manager.clone())
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                terminal_manager.close_all();
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            terminal::create_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            terminal::close_terminal,
            terminal::list_terminals,
            terminal::update_terminal_cwd,
            filesystem::read_directory,
            filesystem::get_home_directory,
            filesystem::list_drives
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
