use serde::Serialize;
use std::process::Command;

const ANALYZE_ARGS: [&str; 4] = [
    "/Online",
    "/Cleanup-Image",
    "/AnalyzeComponentStore",
    "/English",
];
const CLEANUP_ARGS: [&str; 5] = [
    "/Online",
    "/Cleanup-Image",
    "/StartComponentCleanup",
    "/English",
    "/NoRestart",
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ComponentStoreAnalysis {
    pub explorer_reported_size: String,
    pub actual_size: String,
    pub shared_with_windows: Option<String>,
    pub backups_and_disabled_features: Option<String>,
    pub cache_and_temporary_data: Option<String>,
    pub last_cleanup: Option<String>,
    pub reclaimable_packages: Option<u32>,
    pub cleanup_recommended: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ComponentStoreResult {
    pub success: bool,
    pub requires_elevation: bool,
    pub exit_code: Option<i32>,
    pub message: String,
    pub analysis: Option<ComponentStoreAnalysis>,
    pub stdout: String,
    pub stderr: String,
}

fn bounded_output(value: &[u8]) -> String {
    const MAX_OUTPUT_CHARS: usize = 16_000;
    let decoded = String::from_utf8_lossy(value).replace('\0', "");
    decoded.chars().take(MAX_OUTPUT_CHARS).collect()
}

fn field<'a>(output: &'a str, label: &str) -> Option<&'a str> {
    output.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        if key.trim().eq_ignore_ascii_case(label) {
            Some(value.trim())
        } else {
            None
        }
    })
}

fn parse_yes_no(value: &str) -> Option<bool> {
    if value.eq_ignore_ascii_case("yes") {
        Some(true)
    } else if value.eq_ignore_ascii_case("no") {
        Some(false)
    } else {
        None
    }
}

pub fn parse_analysis(output: &str) -> Result<ComponentStoreAnalysis, String> {
    let explorer_reported_size = field(output, "Windows Explorer Reported Size of Component Store")
        .ok_or_else(|| "DISM output did not contain Windows Explorer reported size.".to_string())?;
    let actual_size = field(output, "Actual Size of Component Store")
        .ok_or_else(|| "DISM output did not contain actual Component Store size.".to_string())?;
    let recommendation = field(output, "Component Store Cleanup Recommended")
        .and_then(parse_yes_no)
        .ok_or_else(|| "DISM output did not contain a valid cleanup recommendation.".to_string())?;

    let reclaimable_packages = field(output, "Number of Reclaimable Packages")
        .and_then(|value| value.parse::<u32>().ok());

    Ok(ComponentStoreAnalysis {
        explorer_reported_size: explorer_reported_size.to_string(),
        actual_size: actual_size.to_string(),
        shared_with_windows: field(output, "Shared with Windows").map(str::to_string),
        backups_and_disabled_features: field(output, "Backups and Disabled Features").map(str::to_string),
        cache_and_temporary_data: field(output, "Cache and Temporary Data").map(str::to_string),
        last_cleanup: field(output, "Date of Last Cleanup").map(str::to_string),
        reclaimable_packages,
        cleanup_recommended: recommendation,
    })
}

fn indicates_elevation_required(exit_code: Option<i32>, stdout: &str, stderr: &str) -> bool {
    if exit_code == Some(740) {
        return true;
    }

    let combined = format!("{}\n{}", stdout, stderr).to_ascii_lowercase();
    combined.contains("error: 740")
        || combined.contains("elevated permissions are required")
        || combined.contains("run these tasks with elevated permissions")
}

#[cfg(target_os = "windows")]
fn run_dism(args: &[&str]) -> ComponentStoreResult {
    match Command::new("dism.exe").args(args).output() {
        Ok(output) => {
            let stdout = bounded_output(&output.stdout);
            let stderr = bounded_output(&output.stderr);
            let exit_code = output.status.code();
            let requires_elevation = indicates_elevation_required(exit_code, &stdout, &stderr);

            ComponentStoreResult {
                success: output.status.success(),
                requires_elevation,
                exit_code,
                message: if requires_elevation {
                    "ELEVATION_REQUIRED".to_string()
                } else if output.status.success() {
                    "DISM_COMPLETED".to_string()
                } else {
                    "DISM_FAILED".to_string()
                },
                analysis: None,
                stdout,
                stderr,
            }
        }
        Err(error) => ComponentStoreResult {
            success: false,
            requires_elevation: false,
            exit_code: None,
            message: format!("DISM_SPAWN_FAILED: {}", error),
            analysis: None,
            stdout: String::new(),
            stderr: String::new(),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn run_dism(_args: &[&str]) -> ComponentStoreResult {
    ComponentStoreResult {
        success: false,
        requires_elevation: false,
        exit_code: None,
        message: "WINDOWS_ONLY".to_string(),
        analysis: None,
        stdout: String::new(),
        stderr: String::new(),
    }
}

pub fn analyze_component_store() -> ComponentStoreResult {
    let mut result = run_dism(&ANALYZE_ARGS);
    if result.success {
        match parse_analysis(&result.stdout) {
            Ok(analysis) => result.analysis = Some(analysis),
            Err(error) => {
                result.success = false;
                result.message = format!("DISM_PARSE_FAILED: {}", error);
            }
        }
    }
    result
}

pub fn start_component_cleanup() -> ComponentStoreResult {
    let cleanup = run_dism(&CLEANUP_ARGS);
    if !cleanup.success {
        return cleanup;
    }

    let mut after = analyze_component_store();
    if after.success {
        after.message = "CLEANUP_COMPLETED_AND_REANALYZED".to_string();
    } else {
        after.message = format!("CLEANUP_COMPLETED_REANALYZE_FAILED: {}", after.message);
    }
    after
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
Windows Explorer Reported Size of Component Store : 9.15 GB
Actual Size of Component Store : 8.62 GB
    Shared with Windows : 5.18 GB
    Backups and Disabled Features : 3.11 GB
    Cache and Temporary Data : 337.12 MB
Date of Last Cleanup : 2026-08-10 12:00:00
Number of Reclaimable Packages : 4
Component Store Cleanup Recommended : Yes
"#;

    #[test]
    fn parses_supported_analysis_fields() {
        let parsed = parse_analysis(SAMPLE).expect("valid DISM fixture");
        assert_eq!(parsed.explorer_reported_size, "9.15 GB");
        assert_eq!(parsed.actual_size, "8.62 GB");
        assert_eq!(parsed.reclaimable_packages, Some(4));
        assert!(parsed.cleanup_recommended);
    }

    #[test]
    fn parser_fails_closed_without_recommendation() {
        let output = SAMPLE.replace("Component Store Cleanup Recommended : Yes", "");
        assert!(parse_analysis(&output).is_err());
    }

    #[test]
    fn parser_fails_closed_on_unknown_recommendation() {
        let output = SAMPLE.replace(
            "Component Store Cleanup Recommended : Yes",
            "Component Store Cleanup Recommended : Maybe",
        );
        assert!(parse_analysis(&output).is_err());
    }

    #[test]
    fn detects_elevation_error() {
        assert!(indicates_elevation_required(
            Some(740),
            "Error: 740\nElevated permissions are required to run DISM.",
            ""
        ));
    }

    #[test]
    fn command_arguments_never_include_reset_base() {
        assert!(!ANALYZE_ARGS.iter().any(|arg| arg.eq_ignore_ascii_case("/ResetBase")));
        assert!(!CLEANUP_ARGS.iter().any(|arg| arg.eq_ignore_ascii_case("/ResetBase")));
        assert!(CLEANUP_ARGS.iter().any(|arg| arg.eq_ignore_ascii_case("/NoRestart")));
        assert!(ANALYZE_ARGS.iter().any(|arg| arg.eq_ignore_ascii_case("/English")));
    }
}
