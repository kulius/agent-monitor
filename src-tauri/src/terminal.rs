use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager, Runtime};

// Constants
const DEFAULT_TERMINAL_ROWS: u16 = 24;
const DEFAULT_TERMINAL_COLS: u16 = 80;
const READ_BUFFER_SIZE: usize = 4096;
const MAX_TERMINAL_ID: u32 = u32::MAX - 1;

static NEXT_TERMINAL_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: u32,
    pub name: String,
    pub cwd: String,
    pub created_at: String,
}

struct TerminalInstance {
    info: TerminalInfo,
    #[allow(dead_code)]
    pty_pair: PtyPair,
    writer: Box<dyn Write + Send>,
}

pub struct TerminalManager {
    terminals: Mutex<HashMap<u32, TerminalInstance>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
        }
    }

    pub fn spawn_terminal<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        cwd: Option<String>,
        name: Option<String>,
    ) -> Result<TerminalInfo, String> {
        // Check for ID overflow
        let current_id = NEXT_TERMINAL_ID.load(Ordering::SeqCst);
        if current_id >= MAX_TERMINAL_ID {
            return Err("Terminal ID overflow - please restart the application".to_string());
        }

        let pty_system = native_pty_system();

        let pty_pair = pty_system
            .openpty(PtySize {
                rows: DEFAULT_TERMINAL_ROWS,
                cols: DEFAULT_TERMINAL_COLS,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let working_dir = cwd.clone().unwrap_or_else(|| {
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".to_string())
        });

        let mut cmd = CommandBuilder::new("powershell.exe");
        cmd.args(["-NoLogo", "-NoExit", "-NoProfile"]);
        cmd.cwd(&working_dir);

        // Set environment for better terminal support
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let id = NEXT_TERMINAL_ID.fetch_add(1, Ordering::SeqCst);
        let terminal_name = name.unwrap_or_else(|| format!("Terminal {}", id));

        let info = TerminalInfo {
            id,
            name: terminal_name,
            cwd: working_dir,
            created_at: chrono::Local::now().to_rfc3339(),
        };

        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;

        let mut reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get reader: {}", e))?;

        let instance = TerminalInstance {
            info: info.clone(),
            pty_pair,
            writer,
        };

        self.terminals.lock().insert(id, instance);

        // Spawn reader thread
        let terminal_id = id;
        let app = app_handle.clone();
        thread::spawn(move || {
            let mut buf = [0u8; READ_BUFFER_SIZE];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - terminal closed
                        let _ = app.emit("terminal-closed", terminal_id);
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(
                            "terminal-output",
                            serde_json::json!({
                                "id": terminal_id,
                                "data": data
                            }),
                        );
                    }
                    Err(e) => {
                        // Log error (consider using log crate in production)
                        eprintln!("Error reading from terminal {}: {}", terminal_id, e);
                        let _ = app.emit("terminal-closed", terminal_id);
                        break;
                    }
                }
            }
            // Clean up child process
            drop(child);
        });

        Ok(info)
    }

    pub fn write_to_terminal(&self, id: u32, data: &str) -> Result<(), String> {
        let mut terminals = self.terminals.lock();
        let instance = terminals
            .get_mut(&id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;

        instance
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to terminal: {}", e))?;

        instance
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush terminal: {}", e))?;

        Ok(())
    }

    pub fn resize_terminal(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        let terminals = self.terminals.lock();
        let instance = terminals
            .get(&id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;

        instance
            .pty_pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize terminal: {}", e))?;

        Ok(())
    }

    pub fn close_terminal(&self, id: u32) -> Result<(), String> {
        let mut terminals = self.terminals.lock();
        // Removing the terminal will drop the PtyPair, which closes the PTY
        // This causes the reader thread to receive EOF and clean up
        terminals
            .remove(&id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;
        Ok(())
    }

    pub fn list_terminals(&self) -> Vec<TerminalInfo> {
        let terminals = self.terminals.lock();
        terminals.values().map(|t| t.info.clone()).collect()
    }

    pub fn update_terminal_cwd(&self, id: u32, cwd: String) -> Result<(), String> {
        let mut terminals = self.terminals.lock();
        let instance = terminals
            .get_mut(&id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;
        instance.info.cwd = cwd;
        Ok(())
    }
}

// Tauri Commands
#[tauri::command]
pub fn create_terminal<R: Runtime>(
    app_handle: AppHandle<R>,
    cwd: Option<String>,
    name: Option<String>,
) -> Result<TerminalInfo, String> {
    let manager = app_handle.state::<Arc<TerminalManager>>();
    manager.spawn_terminal(&app_handle, cwd, name)
}

#[tauri::command]
pub fn write_to_terminal<R: Runtime>(
    app_handle: AppHandle<R>,
    id: u32,
    data: String,
) -> Result<(), String> {
    let manager = app_handle.state::<Arc<TerminalManager>>();
    manager.write_to_terminal(id, &data)
}

#[tauri::command]
pub fn resize_terminal<R: Runtime>(
    app_handle: AppHandle<R>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = app_handle.state::<Arc<TerminalManager>>();
    manager.resize_terminal(id, cols, rows)
}

#[tauri::command]
pub fn close_terminal<R: Runtime>(app_handle: AppHandle<R>, id: u32) -> Result<(), String> {
    let manager = app_handle.state::<Arc<TerminalManager>>();
    manager.close_terminal(id)
}

#[tauri::command]
pub fn list_terminals<R: Runtime>(app_handle: AppHandle<R>) -> Vec<TerminalInfo> {
    let manager = app_handle.state::<Arc<TerminalManager>>();
    manager.list_terminals()
}

#[tauri::command]
pub fn update_terminal_cwd<R: Runtime>(
    app_handle: AppHandle<R>,
    id: u32,
    cwd: String,
) -> Result<(), String> {
    let manager = app_handle.state::<Arc<TerminalManager>>();
    manager.update_terminal_cwd(id, cwd)
}
