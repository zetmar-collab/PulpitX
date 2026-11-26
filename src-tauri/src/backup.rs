//! Kopia zapasowa szkiców, słownika i ustawień do pliku JSON w folderze Pobrane.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Webview};

use crate::ensure_main;

const MAX_BYTES: usize = 10 * 1024 * 1024;

/// Zostawia w znaczniku czasu tylko cyfry, '-' i '_', żeby nazwa pliku była bezpieczna.
pub fn safe_stamp(stamp: &str) -> String {
    let clean: String = stamp
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '-' || *c == '_')
        .take(32)
        .collect();
    if clean.is_empty() { "kopia".into() } else { clean }
}

/// Wolna nazwa pliku: pulpitx-kopia-<stamp>.json, a gdy zajęta: ...-2.json itd.
pub fn free_path(dir: &Path, stamp: &str) -> PathBuf {
    let base = format!("pulpitx-kopia-{}", safe_stamp(stamp));
    let mut path = dir.join(format!("{base}.json"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{base}-{n}.json"));
        n += 1;
    }
    path
}

#[tauri::command(async)]
pub fn export_backup(app: AppHandle, webview: Webview, json: String, stamp: String) -> Result<String, String> {
    ensure_main(&webview)?;
    if json.len() > MAX_BYTES {
        return Err("Kopia jest za duża.".into());
    }
    serde_json::from_str::<serde_json::Value>(&json).map_err(|_| "Nieprawidłowe dane kopii.".to_string())?;
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().document_dir())
        .map_err(|_| "Nie znaleziono folderu Pobrane.".to_string())?;
    let path = free_path(&dir, &stamp);
    std::fs::write(&path, json).map_err(|e| format!("Nie udało się zapisać kopii: {e}"))?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamp_cannot_escape_folder() {
        assert_eq!(safe_stamp("../../Windows/x"), "kopia");
        assert_eq!(safe_stamp("..\\2026/../01"), "202601");
        assert_eq!(safe_stamp("2026-11-26_1430"), "2026-11-26_1430");
        assert_eq!(safe_stamp(""), "kopia");
    }

    #[test]
    fn free_path_does_not_overwrite() {
        let dir = std::env::temp_dir().join(format!("pulpitx-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = free_path(&dir, "1");
        std::fs::write(&first, "{}").unwrap();
        let second = free_path(&dir, "1");
        assert_ne!(first, second);
        assert!(second.ends_with("pulpitx-kopia-1-2.json"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
