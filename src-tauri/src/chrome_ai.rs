use crate::{safety, scanner};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const COMPONENT_NAME: &str = "Optimization Guide On Device Model";
const COMPONENT_ID: &str = "fklghjjljmnfjoepjmlobpekiapffcja";
const COMPONENT_DIR: &str = "OptGuideOnDeviceModel";
const MANAGEMENT_URL: &str = "chrome://on-device-internals";
const REQUIRED_FILES: [&str; 2] = ["weights.bin", "on_device_model_execution_config.pb"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ChromeModelVersion {
    pub version: String,
    pub path: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ChromeOnDeviceModelInfo {
    pub installed: bool,
    pub component_name: String,
    pub component_id: String,
    pub root_path: Option<String>,
    pub total_size: u64,
    pub versions: Vec<ChromeModelVersion>,
    pub management_url: String,
}

fn chrome_user_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        return env::var("LOCALAPPDATA")
            .ok()
            .map(PathBuf::from)
            .map(|root| root.join("Google\\Chrome\\User Data"));
    }

    #[cfg(target_os = "macos")]
    {
        return env::var("HOME")
            .ok()
            .map(PathBuf::from)
            .map(|home| home.join("Library/Application Support/Google/Chrome"));
    }

    #[cfg(target_os = "linux")]
    {
        let home = env::var("HOME").ok().map(PathBuf::from)?;
        let config_root = env::var("CHROME_CONFIG_HOME")
            .or_else(|_| env::var("XDG_CONFIG_HOME"))
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".config"));
        return Some(config_root.join("google-chrome"));
    }

    #[allow(unreachable_code)]
    None
}

fn path_is_safe(path: &Path) -> bool {
    let path_string = path.to_string_lossy();
    if safety::is_path_critical(&path_string) || safety::has_windows_reparse_ancestor(path) {
        return false;
    }

    for ancestor in path.ancestors().skip(1) {
        if let Ok(metadata) = fs::symlink_metadata(ancestor) {
            if metadata.file_type().is_symlink() || safety::metadata_is_reparse_point(&metadata) {
                return false;
            }
        }
    }

    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return false,
    };

    !metadata.file_type().is_symlink() && !safety::metadata_is_reparse_point(&metadata)
}

fn parse_component_version(value: &str) -> Option<Vec<u32>> {
    let parts: Vec<&str> = value.split('.').collect();
    if parts.is_empty() || parts.len() > 8 {
        return None;
    }

    parts
        .into_iter()
        .map(|part| {
            if part.is_empty() || !part.chars().all(|ch| ch.is_ascii_digit()) {
                None
            } else {
                part.parse::<u32>().ok()
            }
        })
        .collect()
}

fn verify_version_dir(path: &Path) -> Option<ChromeModelVersion> {
    if !path_is_safe(path) {
        return None;
    }

    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_dir() {
        return None;
    }

    let version = path.file_name()?.to_str()?.to_string();
    parse_component_version(&version)?;

    for required in REQUIRED_FILES {
        let required_path = path.join(required);
        if !path_is_safe(&required_path) {
            return None;
        }
        let required_metadata = fs::symlink_metadata(&required_path).ok()?;
        if !required_metadata.is_file() {
            return None;
        }
    }

    let size = scanner::get_dir_size(path);
    if size == 0 {
        return None;
    }

    Some(ChromeModelVersion {
        version,
        path: path.to_string_lossy().to_string(),
        size,
    })
}

pub fn get_chrome_on_device_model_info() -> ChromeOnDeviceModelInfo {
    let user_data = chrome_user_data_dir();
    let component_root = user_data.as_ref().map(|root| root.join(COMPONENT_DIR));
    let mut versions = Vec::new();

    if let Some(root) = component_root.as_ref().filter(|root| path_is_safe(root)) {
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                if let Some(version) = verify_version_dir(&entry.path()) {
                    versions.push(version);
                }
            }
        }
    }

    versions.sort_by(|left, right| {
        let left_parts = parse_component_version(&left.version).unwrap_or_default();
        let right_parts = parse_component_version(&right.version).unwrap_or_default();
        right_parts.cmp(&left_parts)
    });

    let total_size = versions.iter().map(|entry| entry.size).sum();

    ChromeOnDeviceModelInfo {
        installed: !versions.is_empty(),
        component_name: COMPONENT_NAME.to_string(),
        component_id: COMPONENT_ID.to_string(),
        root_path: component_root.map(|path| path.to_string_lossy().to_string()),
        total_size,
        versions,
        management_url: MANAGEMENT_URL.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn component_version_parser_is_fail_closed() {
        assert_eq!(parse_component_version("2026.8.16.1"), Some(vec![2026, 8, 16, 1]));
        assert_eq!(parse_component_version("1"), Some(vec![1]));
        assert!(parse_component_version("1..2").is_none());
        assert!(parse_component_version("1.beta.2").is_none());
        assert!(parse_component_version("../1.2").is_none());
        assert!(parse_component_version("").is_none());
    }

    #[test]
    fn component_identity_matches_chromium() {
        assert_eq!(COMPONENT_NAME, "Optimization Guide On Device Model");
        assert_eq!(COMPONENT_ID, "fklghjjljmnfjoepjmlobpekiapffcja");
        assert_eq!(COMPONENT_DIR, "OptGuideOnDeviceModel");
        assert_eq!(MANAGEMENT_URL, "chrome://on-device-internals");
    }
}
