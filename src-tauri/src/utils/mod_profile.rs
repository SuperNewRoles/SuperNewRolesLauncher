//! 同梱された mod.config.json を読み込み、機能・配布・パス設定を提供する。
//! 1 build / 1 mod 前提で、起動時に一度だけ検証して全体で共有する。

use regex::Regex;
use serde::Deserialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::OnceLock;

const MOD_CONFIG_RAW: &str = include_str!("../../../src/shared/mod.config.json");

static MOD_PROFILE: OnceLock<ModProfile> = OnceLock::new();

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProfile {
    pub schema_version: u32,
    #[serde(rename = "mod")]
    pub mod_info: ModInfo,
    pub branding: Branding,
    pub features: FeatureFlags,
    pub distribution: Distribution,
    pub paths: Paths,
    pub migration: Migration,
    pub presets: Presets,
    pub apis: ApiEndpoints,
    pub links: Links,
    pub events: Events,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    pub id: String,
    pub display_name: String,
    pub short_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branding {
    pub launcher_name: String,
    pub window_title: String,
    pub tray_tooltip: String,
    pub identifier: String,
    pub modded_shortcut_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureFlags {
    pub announce: bool,
    pub reporting: bool,
    pub presets: bool,
    pub migration: bool,
    pub epic_login: bool,
    pub connect_links: bool,
    pub game_servers: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Distribution {
    pub source: String,
    pub github_repo: String,
    pub asset_regex: AssetRegex,
    pub patchers: Patchers,
    pub updater_latest_json_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRegex {
    pub steam: String,
    pub epic: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patchers {
    pub enabled: bool,
    pub manifest_url: String,
    pub base_url: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Paths {
    pub among_us_exe: String,
    pub among_us_data_dir: String,
    pub save_data_root: String,
    pub local_low_root: String,
    pub report_token_relative_path: String,
    pub profile_required_files: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Migration {
    pub extension: String,
    pub magic: String,
    pub profile_include_patterns: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presets {
    pub extension: String,
    pub options_archive_path: String,
    pub save_data_root: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiEndpoints {
    pub announce_base_url: String,
    pub reporting_base_url: String,
    pub reporting_terms_url: String,
    pub game_servers: Vec<GameServerEndpoint>,
    pub join_direct: JoinDirectEndpoint,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameServerEndpoint {
    pub id: String,
    pub label: String,
    pub rooms_api_domain: String,
    pub server_type: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinDirectEndpoint {
    pub localhost_base_url: String,
    pub join_path: String,
    pub aes_key: String,
    pub aes_iv: String,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Links {
    pub wiki_url: String,
    pub support_discord_url: String,
    #[serde(default)]
    pub official: Vec<OfficialLink>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficialLink {
    pub label: String,
    pub url: String,
    pub background_color: String,
    pub icon_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Events {
    pub install_progress: String,
    pub legacy_install_progress: String,
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum Feature {
    Announce,
    Reporting,
    Presets,
    Migration,
    EpicLogin,
    ConnectLinks,
    GameServers,
}

fn non_empty(name: &str, value: &str) -> Result<(), String> {
    // 空文字や空白のみの設定値は初期化段階で弾く。
    if value.trim().is_empty() {
        return Err(format!("Invalid mod config: '{name}' must not be empty."));
    }
    Ok(())
}

fn parse_mod_profile() -> Result<ModProfile, String> {
    // 埋め込みJSONを読み取り、起動時に一度だけ検証して共有する。
    let mut profile = serde_json::from_str::<ModProfile>(MOD_CONFIG_RAW)
        .map_err(|e| format!("Failed to parse mod.config.json: {e}"))?;
    validate_mod_profile(&mut profile)?;
    Ok(profile)
}

fn validate_mod_profile(profile: &mut ModProfile) -> Result<(), String> {
    // スキーマ不一致は後続処理が壊れるため、最優先で弾く。
    if profile.schema_version != 1 {
        return Err(format!(
            "Unsupported mod config schemaVersion: {} (expected 1)",
            profile.schema_version
        ));
    }

    non_empty("mod.id", &profile.mod_info.id)?;
    non_empty("mod.displayName", &profile.mod_info.display_name)?;
    non_empty("mod.shortName", &profile.mod_info.short_name)?;
    non_empty("branding.launcherName", &profile.branding.launcher_name)?;
    non_empty("branding.windowTitle", &profile.branding.window_title)?;
    non_empty("branding.trayTooltip", &profile.branding.tray_tooltip)?;
    non_empty("branding.identifier", &profile.branding.identifier)?;
    non_empty(
        "branding.moddedShortcutName",
        &profile.branding.modded_shortcut_name,
    )?;

    if profile.distribution.source.trim() != "github" {
        return Err(format!(
            "Invalid mod config: unsupported distribution.source '{}'",
            profile.distribution.source
        ));
    }
    // リポジトリ指定の書式を事前検証し、API URL組み立て時の不整合を防ぐ。
    non_empty("distribution.githubRepo", &profile.distribution.github_repo)?;
    let github_repo = profile.distribution.github_repo.trim();
    let is_valid_repo_format = github_repo
        .split_once('/')
        .is_some_and(|(owner, repo)| !owner.is_empty() && !repo.is_empty() && !repo.contains('/'));
    if !is_valid_repo_format {
        return Err(
            "Invalid mod config: distribution.githubRepo must be '<owner>/<repo>'".to_string(),
        );
    }
    profile.distribution.github_repo = github_repo.to_string();
    non_empty(
        "distribution.assetRegex.steam",
        &profile.distribution.asset_regex.steam,
    )?;
    non_empty(
        "distribution.assetRegex.epic",
        &profile.distribution.asset_regex.epic,
    )?;
    Regex::new(&profile.distribution.asset_regex.steam).map_err(|e| {
        format!("Invalid mod config: distribution.assetRegex.steam is not a valid regex: {e}")
    })?;
    // Epic用のアセット抽出正規表現もここでコンパイル検証する。
    Regex::new(&profile.distribution.asset_regex.epic).map_err(|e| {
        format!("Invalid mod config: distribution.assetRegex.epic is not a valid regex: {e}")
    })?;
    non_empty(
        "distribution.updaterLatestJsonUrl",
        &profile.distribution.updater_latest_json_url,
    )?;
    non_empty(
        "distribution.patchers.manifestUrl",
        &profile.distribution.patchers.manifest_url,
    )?;
    non_empty(
        "distribution.patchers.baseUrl",
        &profile.distribution.patchers.base_url,
    )?;

    non_empty("paths.amongUsExe", &profile.paths.among_us_exe)?;
    non_empty("paths.amongUsDataDir", &profile.paths.among_us_data_dir)?;
    non_empty("paths.saveDataRoot", &profile.paths.save_data_root)?;
    non_empty("paths.localLowRoot", &profile.paths.local_low_root)?;
    non_empty(
        "paths.reportTokenRelativePath",
        &profile.paths.report_token_relative_path,
    )?;
    if profile.paths.profile_required_files.is_empty() {
        return Err(
            "Invalid mod config: paths.profileRequiredFiles must contain at least one entry."
                .to_string(),
        );
    }
    for (idx, item) in profile.paths.profile_required_files.iter().enumerate() {
        non_empty(&format!("paths.profileRequiredFiles[{idx}]"), item)?;
    }

    non_empty("migration.extension", &profile.migration.extension)?;
    if !profile
        .migration
        .extension
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric())
    {
        return Err("Invalid mod config: migration.extension must be alphanumeric.".to_string());
    }
    non_empty("migration.magic", &profile.migration.magic)?;
    if profile.migration.profile_include_patterns.is_empty() {
        return Err(
            "Invalid mod config: migration.profileIncludePatterns must contain at least one entry."
                .to_string(),
        );
    }
    for (idx, pattern) in profile
        .migration
        .profile_include_patterns
        .iter()
        .enumerate()
    {
        non_empty(&format!("migration.profileIncludePatterns[{idx}]"), pattern)?;
        Regex::new(pattern).map_err(|e| {
            format!(
                "Invalid mod config: migration.profileIncludePatterns[{idx}] is not a valid regex: {e}"
            )
        })?;
    }

    non_empty("presets.extension", &profile.presets.extension)?;
    if !profile
        .presets
        .extension
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric())
    {
        return Err("Invalid mod config: presets.extension must be alphanumeric.".to_string());
    }
    non_empty(
        "presets.optionsArchivePath",
        &profile.presets.options_archive_path,
    )?;
    non_empty("presets.saveDataRoot", &profile.presets.save_data_root)?;

    non_empty("apis.announceBaseUrl", &profile.apis.announce_base_url)?;
    if !profile.apis.announce_base_url.ends_with('/') {
        profile.apis.announce_base_url.push('/');
    }
    non_empty("apis.reportingBaseUrl", &profile.apis.reporting_base_url)?;
    non_empty("apis.reportingTermsUrl", &profile.apis.reporting_terms_url)?;
    if profile.apis.game_servers.is_empty() {
        return Err("Invalid mod config: apis.gameServers must contain at least one entry."
            .to_string());
    }
    let mut seen_game_server_ids = HashSet::new();
    for (idx, server) in profile.apis.game_servers.iter_mut().enumerate() {
        non_empty(&format!("apis.gameServers[{idx}].id"), &server.id)?;
        let id = server.id.trim().to_string();
        if !seen_game_server_ids.insert(id.clone()) {
            return Err(format!("Invalid mod config: duplicate apis.gameServers id '{id}'"));
        }
        server.id = id;
        non_empty(&format!("apis.gameServers[{idx}].label"), &server.label)?;
        server.label = server.label.trim().to_string();
        non_empty(
            &format!("apis.gameServers[{idx}].roomsApiDomain"),
            &server.rooms_api_domain,
        )?;
        server.rooms_api_domain = server
            .rooms_api_domain
            .trim()
            .trim_end_matches('/')
            .to_string();
        if server.server_type < 0 {
            return Err(format!(
                "Invalid mod config: apis.gameServers[{idx}].serverType must be >= 0."
            ));
        }
    }

    non_empty(
        "apis.joinDirect.localhostBaseUrl",
        &profile.apis.join_direct.localhost_base_url,
    )?;
    profile.apis.join_direct.localhost_base_url = profile
        .apis
        .join_direct
        .localhost_base_url
        .trim()
        .trim_end_matches('/')
        .to_string();
    non_empty("apis.joinDirect.joinPath", &profile.apis.join_direct.join_path)?;
    let join_path = profile.apis.join_direct.join_path.trim().to_string();
    profile.apis.join_direct.join_path = if join_path.starts_with('/') {
        join_path
    } else {
        format!("/{join_path}")
    };
    non_empty("apis.joinDirect.aesKey", &profile.apis.join_direct.aes_key)?;
    profile.apis.join_direct.aes_key = profile.apis.join_direct.aes_key.trim().to_string();
    if profile.apis.join_direct.aes_key.as_bytes().len() != 16 {
        return Err("Invalid mod config: apis.joinDirect.aesKey must be exactly 16 bytes."
            .to_string());
    }
    non_empty("apis.joinDirect.aesIv", &profile.apis.join_direct.aes_iv)?;
    profile.apis.join_direct.aes_iv = profile.apis.join_direct.aes_iv.trim().to_string();
    if profile.apis.join_direct.aes_iv.as_bytes().len() != 16 {
        return Err("Invalid mod config: apis.joinDirect.aesIv must be exactly 16 bytes."
            .to_string());
    }
    if profile.apis.join_direct.timeout_ms == 0 {
        return Err("Invalid mod config: apis.joinDirect.timeoutMs must be greater than 0."
            .to_string());
    }

    non_empty("links.wikiUrl", &profile.links.wiki_url)?;
    non_empty(
        "links.supportDiscordUrl",
        &profile.links.support_discord_url,
    )?;
    for (idx, item) in profile.links.official.iter().enumerate() {
        non_empty(&format!("links.official[{idx}].label"), &item.label)?;
        non_empty(&format!("links.official[{idx}].url"), &item.url)?;
        non_empty(
            &format!("links.official[{idx}].backgroundColor"),
            &item.background_color,
        )?;
        non_empty(&format!("links.official[{idx}].iconId"), &item.icon_id)?;
    }

    non_empty("events.installProgress", &profile.events.install_progress)?;
    non_empty(
        "events.legacyInstallProgress",
        &profile.events.legacy_install_progress,
    )?;

    Ok(())
}

pub fn validate() -> Result<(), String> {
    // 既に初期化済みなら再検証は不要。
    if MOD_PROFILE.get().is_some() {
        return Ok(());
    }
    let profile = parse_mod_profile()?;
    MOD_PROFILE
        .set(profile)
        .map_err(|_| "Failed to initialize mod profile config.".to_string())
}

pub fn get() -> &'static ModProfile {
    // 未初期化時は初回アクセスで同期的に初期化する。
    MOD_PROFILE.get_or_init(|| match parse_mod_profile() {
        Ok(profile) => profile,
        Err(error) => panic!("Invalid mod.config.json: {error}"),
    })
}

pub fn feature_enabled(feature: Feature) -> bool {
    // 機能フラグは単一点参照にして呼び出し側の分岐を簡潔に保つ。
    let features = &get().features;
    match feature {
        Feature::Announce => features.announce,
        Feature::Reporting => features.reporting,
        Feature::Presets => features.presets,
        Feature::Migration => features.migration,
        Feature::EpicLogin => features.epic_login,
        Feature::ConnectLinks => features.connect_links,
        Feature::GameServers => features.game_servers,
    }
}

pub fn ensure_feature_enabled(feature: Feature) -> Result<(), String> {
    if feature_enabled(feature) {
        return Ok(());
    }

    // エラーメッセージは mod.config.json のキー名に合わせて返す。
    let name = match feature {
        Feature::Announce => "announce",
        Feature::Reporting => "reporting",
        Feature::Presets => "presets",
        Feature::Migration => "migration",
        Feature::EpicLogin => "epicLogin",
        Feature::ConnectLinks => "connectLinks",
        Feature::GameServers => "gameServers",
    };
    Err(format!("Feature '{name}' is disabled by mod.config.json."))
}

pub fn github_releases_api_url() -> String {
    // リリース一覧取得は共通のper_pageで固定する。
    format!(
        "https://api.github.com/repos/{}/releases?per_page=30",
        get().distribution.github_repo
    )
}

pub fn github_release_by_tag_api_base_url() -> String {
    // タグ指定APIは呼び出し側でタグを後置できるよう、末尾 /tags まで返す。
    format!(
        "https://api.github.com/repos/{}/releases/tags",
        get().distribution.github_repo
    )
}

pub fn to_relative_path(value: &str) -> PathBuf {
    let mut result = PathBuf::new();
    // 余分な区切りや空セグメントを無視して安全な相対パスへ変換する。
    for segment in value
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
    {
        result.push(segment);
    }
    result
}

pub fn save_data_root_path() -> PathBuf {
    to_relative_path(&get().paths.save_data_root)
}

pub fn local_low_root_path() -> PathBuf {
    to_relative_path(&get().paths.local_low_root)
}

pub fn default_game_server_id() -> Option<&'static str> {
    get().apis.game_servers.first().map(|server| server.id.as_str())
}
