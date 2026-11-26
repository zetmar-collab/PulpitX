//! Sprawdzanie pisowni offline (Hunspell przez crate `spellbook`).
//!
//! Zastępuje nspell w Web Workerze: polski słownik ładuje się w ~70 ms i zajmuje
//! kilkadziesiąt MB zamiast ~5 s i ~490 MB.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::Deserialize;
use spellbook::Dictionary;
use tauri::{State, Webview};

use crate::ensure_main;

const PL_AFF: &str = include_str!("../dictionaries/pl.aff");
const PL_DIC: &str = include_str!("../dictionaries/pl.dic");
const EN_AFF: &str = include_str!("../dictionaries/en.aff");
const EN_DIC: &str = include_str!("../dictionaries/en.dic");

const MAX_WORDS: usize = 600;
const MAX_WORD_LEN: usize = 64;
const MAX_SUGGESTED: usize = 12;
const MAX_SUGGESTIONS: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    Pl,
    En,
    Both,
}

#[derive(Default)]
pub struct Engines {
    pl: OnceLock<Result<Dictionary, String>>,
    en: OnceLock<Result<Dictionary, String>>,
    cache: Mutex<HashMap<(Lang, String), Vec<String>>>,
}

impl Engines {
    fn polish(&self) -> Result<&Dictionary, String> {
        self.pl
            .get_or_init(|| Dictionary::new(PL_AFF, PL_DIC).map_err(|e| format!("Słownik polski: {e}")))
            .as_ref()
            .map_err(Clone::clone)
    }

    fn english(&self) -> Result<&Dictionary, String> {
        self.en
            .get_or_init(|| Dictionary::new(EN_AFF, EN_DIC).map_err(|e| format!("Słownik angielski: {e}")))
            .as_ref()
            .map_err(Clone::clone)
    }

    fn dictionaries(&self, lang: Lang) -> Result<Vec<&Dictionary>, String> {
        Ok(match lang {
            Lang::Pl => vec![self.polish()?],
            Lang::En => vec![self.english()?],
            Lang::Both => vec![self.polish()?, self.english()?],
        })
    }

    pub fn warm(&self) -> Result<(), String> {
        self.polish()?;
        self.english()?;
        Ok(())
    }

    fn suggestions(&self, dicts: &[&Dictionary], lang: Lang, word: &str) -> Vec<String> {
        let key = (lang, word.to_string());
        if let Some(hit) = self.cache.lock().unwrap_or_else(|e| e.into_inner()).get(&key) {
            return hit.clone();
        }
        let lists: Vec<Vec<String>> = dicts
            .iter()
            .map(|dict| {
                let mut out = Vec::new();
                dict.suggest(word, &mut out);
                out
            })
            .collect();
        let merged = merge_suggestions(&lists, MAX_SUGGESTIONS);
        let mut cache = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        if cache.len() > 4000 {
            cache.clear();
        }
        cache.insert(key, merged.clone());
        merged
    }

    /// Dla każdego słowa: `None` gdy poprawne, `Some(podpowiedzi)` gdy nie.
    pub fn check(&self, words: &[String], lang: Lang) -> Result<Vec<Option<Vec<String>>>, String> {
        let dicts = self.dictionaries(lang)?;
        let mut suggested = 0;
        Ok(words
            .iter()
            .take(MAX_WORDS)
            .map(|word| {
                if word.chars().count() > MAX_WORD_LEN || dicts.iter().any(|d| d.check(word)) {
                    return None;
                }
                if suggested >= MAX_SUGGESTED {
                    return Some(Vec::new());
                }
                suggested += 1;
                Some(self.suggestions(&dicts, lang, word))
            })
            .collect())
    }
}

/// Łączy listy podpowiedzi, bez powtórzeń (bez względu na wielkość liter).
pub fn merge_suggestions(lists: &[Vec<String>], max: usize) -> Vec<String> {
    let mut seen = Vec::<String>::new();
    let mut out = Vec::new();
    for item in lists.iter().flatten() {
        let key = item.to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.push(key);
        out.push(item.clone());
        if out.len() >= max {
            break;
        }
    }
    out
}

#[tauri::command(async)]
pub fn spell_warm(webview: Webview, engines: State<'_, Engines>) -> Result<(), String> {
    ensure_main(&webview)?;
    engines.warm()
}

#[tauri::command(async)]
pub fn spell_check(
    webview: Webview,
    engines: State<'_, Engines>,
    words: Vec<String>,
    lang: Lang,
) -> Result<Vec<Option<Vec<String>>>, String> {
    ensure_main(&webview)?;
    engines.check(&words, lang)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn words(list: &[&str]) -> Vec<String> {
        list.iter().map(|w| w.to_string()).collect()
    }

    #[test]
    fn polish_words_and_suggestions() {
        let engines = Engines::default();
        let result = engines
            .check(&words(&["zażółć", "gęślą", "jaźń", "dzienkuje"]), Lang::Pl)
            .unwrap();
        assert_eq!(result[0], None);
        assert_eq!(result[1], None);
        assert_eq!(result[2], None);
        assert!(result[3].as_ref().unwrap().contains(&"dziękuje".to_string()));
    }

    #[test]
    fn both_languages_accept_either() {
        let engines = Engines::default();
        let result = engines.check(&words(&["hello", "kot", "spelinng"]), Lang::Both).unwrap();
        assert_eq!(result[0], None);
        assert_eq!(result[1], None);
        assert!(result[2].is_some());
        let english_only = engines.check(&words(&["żółw"]), Lang::En).unwrap();
        assert!(english_only[0].is_some());
    }

    #[test]
    fn merge_removes_case_duplicates() {
        let merged = merge_suggestions(
            &[words(&["Kraków", "krakus"]), words(&["kraków", "Krak"])],
            3,
        );
        assert_eq!(merged, words(&["Kraków", "krakus", "Krak"]));
    }

    #[test]
    fn suggestions_are_limited() {
        let engines = Engines::default();
        let many: Vec<String> = (0..20).map(|i| format!("qqqzz{i}x")).collect();
        let result = engines.check(&many, Lang::Pl).unwrap();
        assert!(result.iter().all(Option::is_some));
    }
}
