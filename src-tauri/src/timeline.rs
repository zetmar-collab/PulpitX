//! Widok x.com osadzony obok edytora.
//!
//! Webview tworzy i układa Rust, nie frontend. Dzięki temu:
//! - nasłuch zmiany rozmiaru jest jeden na całe okno (brak wycieku),
//! - „Strona główna X” nawiguje w istniejącym widoku zamiast go odtwarzać (brak wyścigu),
//! - nawigacja poza x.com trafia do przeglądarki systemowej,
//! - frontend nie potrzebuje uprawnień do tworzenia webview.

use std::sync::{mpsc, Mutex};
use std::time::Duration;

use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, Url, Webview, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

use crate::ensure_main;

pub const X_LABEL: &str = "x-home";
const MAIN_WINDOW: &str = "main";
const HOME_URL: &str = "https://x.com/home";

pub const DEFAULT_SIDEBAR: f64 = 440.0;
pub const MIN_SIDEBAR: f64 = 360.0;
pub const MIN_STAGE: f64 = 420.0;

pub struct Layout {
    sidebar: Mutex<f64>,
    /// Serializuje tworzenie widoku, żeby nie powstały dwa webview o tej samej etykiecie.
    create: Mutex<()>,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            sidebar: Mutex::new(DEFAULT_SIDEBAR),
            create: Mutex::new(()),
        }
    }
}

impl Layout {
    fn sidebar(&self) -> f64 {
        *self.sidebar.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn set_sidebar(&self, width: f64) {
        *self.sidebar.lock().unwrap_or_else(|e| e.into_inner()) = width;
    }
}

/// Szerokość panelu edytora mieszcząca się w oknie.
pub fn clamp_sidebar(requested: f64, window_width: f64) -> f64 {
    let max = (window_width - MIN_STAGE).max(MIN_SIDEBAR);
    let wanted = if requested.is_finite() { requested } else { DEFAULT_SIDEBAR };
    wanted.clamp(MIN_SIDEBAR, max)
}

/// Pozycja i rozmiar widoku X (logiczne piksele): x, y, szerokość, wysokość.
pub fn stage_bounds(sidebar: f64, width: f64, height: f64) -> (f64, f64, f64, f64) {
    let x = clamp_sidebar(sidebar, width);
    (x, 0.0, (width - x).max(1.0), height.max(1.0))
}

fn host_matches(host: &str, domain: &str) -> bool {
    host == domain || host.ends_with(&format!(".{domain}"))
}

pub fn is_x_host(host: &str) -> bool {
    ["x.com", "twitter.com"].iter().any(|d| host_matches(host, d))
}

/// Strony logowania, którymi X loguje przez konto Google lub Apple.
pub fn is_auth_host(host: &str) -> bool {
    ["accounts.google.com", "accounts.youtube.com", "appleid.apple.com"].contains(&host)
}

#[derive(Debug, PartialEq, Eq)]
pub enum Nav {
    /// Zostaje w widoku X.
    Stay,
    /// Otwiera się w przeglądarce systemowej.
    External,
    /// Zablokowane (np. file:).
    Block,
}

pub fn classify(url: &Url) -> Nav {
    match url.scheme() {
        "http" | "https" => match url.host_str() {
            Some(host) if is_x_host(host) || is_auth_host(host) => Nav::Stay,
            Some(_) => Nav::External,
            None => Nav::Block,
        },
        "about" | "blob" | "data" => Nav::Stay,
        "mailto" => Nav::External,
        _ => Nav::Block,
    }
}

fn open_external(app: &AppHandle, url: &Url) {
    let _ = app.opener().open_url(url.as_str(), None::<&str>);
}

fn current_bounds(app: &AppHandle, layout: &Layout) -> Option<(f64, f64, f64, f64)> {
    let window = app.get_window(MAIN_WINDOW)?;
    let scale = window.scale_factor().ok()?;
    let size = window.inner_size().ok()?;
    if size.width == 0 || size.height == 0 {
        // Okno zminimalizowane — nie ruszamy widoku.
        return None;
    }
    let logical = size.to_logical::<f64>(scale);
    Some(stage_bounds(layout.sidebar(), logical.width, logical.height))
}

/// Dopasowuje widok X do okna. Wołane przy zmianie rozmiaru, skali i szerokości panelu.
pub fn relayout(app: &AppHandle) {
    let layout = app.state::<Layout>();
    let Some(webview) = app.get_webview(X_LABEL) else {
        return;
    };
    let Some((x, y, width, height)) = current_bounds(app, &layout) else {
        return;
    };
    let _ = webview.set_position(LogicalPosition::new(x, y));
    let _ = webview.set_size(LogicalSize::new(width, height));
}

fn build(app: &AppHandle, layout: &Layout) -> Result<Webview, String> {
    let window = app
        .get_window(MAIN_WINDOW)
        .ok_or_else(|| "Nie znaleziono okna aplikacji.".to_string())?;
    let (x, y, width, height) = current_bounds(app, layout).unwrap_or((
        layout.sidebar(),
        0.0,
        800.0,
        700.0,
    ));
    let url = Url::parse(HOME_URL).map_err(|e| e.to_string())?;

    let nav_app = app.clone();
    let popup_app = app.clone();
    let builder = WebviewBuilder::new(X_LABEL, WebviewUrl::External(url))
        .on_navigation(move |url| match classify(url) {
            Nav::Stay => true,
            Nav::External => {
                open_external(&nav_app, url);
                false
            }
            Nav::Block => false,
        })
        .on_new_window(move |url, _features| {
            match url.host_str() {
                // Okienko logowania Google/Apple musi się otworzyć, inaczej logowanie nie zadziała.
                Some(host) if is_auth_host(host) => return NewWindowResponse::Allow,
                _ => {}
            }
            if classify(&url) != Nav::Block {
                open_external(&popup_app, &url);
            }
            NewWindowResponse::Deny
        })
        .disable_drag_drop_handler()
        .focused(false);

    window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(width, height))
        .map_err(|e| format!("Nie udało się otworzyć X: {e}"))
}

/// Otwiera widok X (jeśli jeszcze go nie ma) i ustawia szerokość panelu.
#[tauri::command(async)]
pub fn open_timeline(
    app: AppHandle,
    webview: Webview,
    layout: State<'_, Layout>,
    sidebar: f64,
) -> Result<f64, String> {
    ensure_main(&webview)?;
    let _guard = layout.create.lock().unwrap_or_else(|e| e.into_inner());
    layout.set_sidebar(sidebar);
    if app.get_webview(X_LABEL).is_none() {
        build(&app, &layout)?;
    }
    relayout(&app);
    Ok(layout.sidebar())
}

/// Wraca na x.com/home w istniejącym widoku (albo go tworzy).
#[tauri::command(async)]
pub fn go_home(app: AppHandle, webview: Webview, layout: State<'_, Layout>) -> Result<(), String> {
    ensure_main(&webview)?;
    let _guard = layout.create.lock().unwrap_or_else(|e| e.into_inner());
    match app.get_webview(X_LABEL) {
        Some(view) => {
            let url = Url::parse(HOME_URL).map_err(|e| e.to_string())?;
            view.navigate(url).map_err(|e| format!("Nie udało się wrócić na stronę główną: {e}"))
        }
        None => build(&app, &layout).map(|_| ()),
    }?;
    relayout(&app);
    Ok(())
}

/// Zmienia szerokość panelu edytora. Zwraca szerokość po dopasowaniu do okna.
#[tauri::command]
pub fn set_sidebar(app: AppHandle, webview: Webview, layout: State<'_, Layout>, width: f64) -> Result<f64, String> {
    ensure_main(&webview)?;
    let window_width = app
        .get_window(MAIN_WINDOW)
        .and_then(|w| {
            let scale = w.scale_factor().ok()?;
            Some(w.inner_size().ok()?.to_logical::<f64>(scale).width)
        })
        .unwrap_or(width + MIN_STAGE);
    let clamped = clamp_sidebar(width, window_width);
    layout.set_sidebar(clamped);
    relayout(&app);
    Ok(clamped)
}

/// Skrypt wklejający tekst w pole posta na x.com. Niczego nie publikuje.
pub fn insert_script(text: &str) -> String {
    let literal = serde_json::to_string(text).unwrap_or_else(|_| "\"\"".into());
    format!(
        r#"(function (text) {{
  function find() {{
    var nodes = Array.prototype.slice.call(document.querySelectorAll(
      '[data-testid^="tweetTextarea_"][contenteditable="true"], [data-testid^="tweetTextarea_"] [contenteditable="true"]'
    )).filter(function (el) {{ return el.offsetParent !== null; }});
    return nodes.length ? nodes[nodes.length - 1] : null;
  }}
  function put(el) {{
    el.focus();
    var data = new DataTransfer();
    data.setData('text/plain', text);
    var paste = new ClipboardEvent('paste', {{ clipboardData: data, bubbles: true, cancelable: true }});
    el.dispatchEvent(paste);
    if (!paste.defaultPrevented) document.execCommand('insertText', false, text);
  }}
  var box = find();
  if (box) {{ put(box); return 'inserted'; }}
  var button = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
  if (!button) return 'missing';
  button.click();
  var tries = 0;
  var timer = setInterval(function () {{
    tries += 1;
    var next = find();
    if (next) {{ clearInterval(timer); put(next); }}
    else if (tries > 40) clearInterval(timer);
  }}, 100);
  return 'opening';
}})({literal})"#
    )
}

/// Wkleja tekst w pole posta w widoku X. Zwraca: inserted | opening | missing.
#[tauri::command(async)]
pub fn insert_into_x(app: AppHandle, webview: Webview, text: String) -> Result<String, String> {
    ensure_main(&webview)?;
    if text.trim().is_empty() {
        return Err("Najpierw napisz post.".into());
    }
    let view = app
        .get_webview(X_LABEL)
        .ok_or_else(|| "Widok X nie jest otwarty.".to_string())?;
    let (tx, rx) = mpsc::channel();
    view.eval_with_callback(insert_script(&text), move |result| {
        let _ = tx.send(result);
    })
    .map_err(|e| format!("Nie udało się wstawić tekstu: {e}"))?;
    let raw = rx
        .recv_timeout(Duration::from_secs(4))
        .map_err(|_| "X nie odpowiedział.".to_string())?;
    let status = serde_json::from_str::<String>(&raw).unwrap_or(raw);
    let _ = view.set_focus();
    Ok(status)
}

/// Otwiera x.com/home w przeglądarce systemowej.
#[tauri::command]
pub fn open_in_browser(app: AppHandle, webview: Webview) -> Result<(), String> {
    ensure_main(&webview)?;
    app.opener()
        .open_url(HOME_URL, None::<&str>)
        .map_err(|e| format!("Nie udało się otworzyć przeglądarki: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nav(url: &str) -> Nav {
        classify(&Url::parse(url).unwrap())
    }

    #[test]
    fn x_pages_stay_in_view() {
        assert_eq!(nav("https://x.com/home"), Nav::Stay);
        assert_eq!(nav("https://mobile.x.com/i/flow/login"), Nav::Stay);
        assert_eq!(nav("https://twitter.com/settings"), Nav::Stay);
        assert_eq!(nav("https://accounts.google.com/o/oauth2"), Nav::Stay);
        assert_eq!(nav("about:blank"), Nav::Stay);
    }

    #[test]
    fn other_sites_go_to_browser() {
        assert_eq!(nav("https://t.co/abc"), Nav::External);
        assert_eq!(nav("https://example.com"), Nav::External);
        assert_eq!(nav("https://notx.com"), Nav::External);
        assert_eq!(nav("https://x.com.evil.example"), Nav::External);
        assert_eq!(nav("mailto:a@b.pl"), Nav::External);
    }

    #[test]
    fn local_schemes_are_blocked() {
        assert_eq!(nav("file:///C:/Windows/win.ini"), Nav::Block);
        assert_eq!(nav("ms-settings:privacy"), Nav::Block);
    }

    #[test]
    fn sidebar_stays_inside_window() {
        assert_eq!(clamp_sidebar(440.0, 1360.0), 440.0);
        assert_eq!(clamp_sidebar(100.0, 1360.0), MIN_SIDEBAR);
        assert_eq!(clamp_sidebar(5000.0, 1360.0), 1360.0 - MIN_STAGE);
        assert_eq!(clamp_sidebar(f64::NAN, 1360.0), DEFAULT_SIDEBAR);
        assert_eq!(clamp_sidebar(500.0, 600.0), MIN_SIDEBAR);
    }

    #[test]
    fn stage_fills_rest_of_window() {
        assert_eq!(stage_bounds(440.0, 1360.0, 860.0), (440.0, 0.0, 920.0, 860.0));
    }

    #[test]
    fn insert_script_escapes_text() {
        let script = insert_script("a\"); alert(1); (\"\n</script>");
        assert!(script.contains(r#"("a\"); alert(1); (\"\n</script>")"#));
    }
}
