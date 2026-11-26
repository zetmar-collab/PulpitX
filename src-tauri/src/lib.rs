mod backup;
mod spell;
mod timeline;

use tauri::{Manager, Webview, WindowEvent};
use tauri_plugin_notification::NotificationExt;

/// Komendy aplikacji przyjmujemy tylko z okna edytora, nigdy z widoku x.com.
pub(crate) fn ensure_main(webview: &Webview) -> Result<(), String> {
    if webview.label() == "main" {
        Ok(())
    } else {
        Err("Brak dostępu.".into())
    }
}

/// Powiadomienie systemowe (przypomnienia o publikacji).
#[tauri::command]
fn notify(app: tauri::AppHandle, webview: Webview, title: String, body: String) -> Result<(), String> {
    ensure_main(&webview)?;
    let title: String = title.chars().take(120).collect();
    let body: String = body.chars().take(300).collect();
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| format!("Nie udało się pokazać powiadomienia: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(timeline::Layout::default())
        .manage(spell::Engines::default())
        .invoke_handler(tauri::generate_handler![
            timeline::open_timeline,
            timeline::go_home,
            timeline::set_sidebar,
            timeline::insert_into_x,
            timeline::open_in_browser,
            spell::spell_warm,
            spell::spell_check,
            backup::export_backup,
            notify,
        ])
        .setup(|app| {
            if let Some(window) = app.get_window("main") {
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(
                        event,
                        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }
                    ) {
                        timeline::relayout(&handle);
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
