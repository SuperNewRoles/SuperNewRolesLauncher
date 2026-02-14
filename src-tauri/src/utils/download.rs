use futures_util::StreamExt;
use reqwest::Client;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(600);
const USER_AGENT: &str = "SuperNewRolesLauncher/0.1";
const DOWNLOAD_PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(120);
const DOWNLOAD_PROGRESS_MIN_BYTES_DELTA: u64 = 512 * 1024;
const DOWNLOAD_PROGRESS_MIN_PERCENT_DELTA: f64 = 1.0;

pub fn github_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))
}

pub async fn download_file<F>(
    client: &Client,
    url: &str,
    destination: &Path,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u64, Option<u64>),
{
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status {}", response.status()));
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create cache directory: {e}"))?;
    }

    let total_size = response.content_length();
    let mut file =
        File::create(destination).map_err(|e| format!("Failed to create download file: {e}"))?;
    let mut stream = response.bytes_stream();

    let mut downloaded = 0_u64;
    let mut last_emitted_downloaded = 0_u64;
    let mut last_emitted_percent = Some(0.0_f64);
    let mut last_emitted_at = Instant::now();
    on_progress(downloaded, total_size);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream failed: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write download chunk: {e}"))?;
        downloaded += chunk.len() as u64;

        let current_percent = total_size
            .filter(|total| *total > 0)
            .map(|total| (downloaded as f64 / total as f64) * 100.0);
        let progressed_percent = match (current_percent, last_emitted_percent) {
            (Some(current), Some(last)) => current - last >= DOWNLOAD_PROGRESS_MIN_PERCENT_DELTA,
            _ => false,
        };
        let progressed_bytes =
            downloaded.saturating_sub(last_emitted_downloaded) >= DOWNLOAD_PROGRESS_MIN_BYTES_DELTA;
        let interval_elapsed = last_emitted_at.elapsed() >= DOWNLOAD_PROGRESS_MIN_INTERVAL;
        let is_final = total_size.map(|total| downloaded >= total).unwrap_or(false);

        if progressed_percent || progressed_bytes || interval_elapsed || is_final {
            on_progress(downloaded, total_size);
            last_emitted_downloaded = downloaded;
            last_emitted_percent = current_percent;
            last_emitted_at = Instant::now();
        }
    }

    if downloaded != last_emitted_downloaded {
        on_progress(downloaded, total_size);
    }

    Ok(())
}
