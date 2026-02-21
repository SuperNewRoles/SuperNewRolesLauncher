// zip展開時の安全性チェックと進捗通知を提供する。
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const ZIP_COPY_BUFFER_SIZE: usize = 256 * 1024;
const EXTRACT_PROGRESS_MIN_INTERVAL: Duration = Duration::from_millis(120);

fn copy_with_reused_buffer<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    buffer: &mut [u8],
) -> std::io::Result<u64> {
    let mut written = 0_u64;

    loop {
        // 再利用バッファでコピーし、エントリごとの割り当てを抑える。
        let read = reader.read(buffer)?;
        if read == 0 {
            break;
        }

        writer.write_all(&buffer[..read])?;
        written += read as u64;
    }

    Ok(written)
}

pub fn extract_zip<F>(zip_path: &Path, destination: &Path, mut on_progress: F) -> Result<(), String>
where
    F: FnMut(usize, usize),
{
    // zip-slip対策のため、各エントリは必ずenclosed_nameで検証する。
    let file = File::open(zip_path).map_err(|e| format!("Failed to open zip archive: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive format: {e}"))?;

    fs::create_dir_all(destination)
        .map_err(|e| format!("Failed to create extraction directory: {e}"))?;

    let total = archive.len();
    // エントリ数が少ない場合も進捗が止まって見えないよう最小ステップを1にする。
    let progress_step = (total / 100).max(1);
    let mut last_reported = 0_usize;
    let mut last_progress_emitted_at = Instant::now();
    let mut copy_buffer = vec![0_u8; ZIP_COPY_BUFFER_SIZE];
    let mut created_dirs = HashSet::<PathBuf>::new();
    created_dirs.insert(destination.to_path_buf());
    on_progress(0, total);

    for i in 0..total {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read zip entry {i}: {e}"))?;

        let enclosed = entry.enclosed_name().ok_or_else(|| {
            format!(
                "Refused unsafe zip entry path (zip-slip protection): {}",
                entry.name()
            )
        })?;

        let output_path = destination.join(enclosed);
        if entry.is_dir() {
            if created_dirs.insert(output_path.clone()) {
                fs::create_dir_all(&output_path)
                    .map_err(|e| format!("Failed to create directory during extraction: {e}"))?;
            }
        } else {
            if let Some(parent) = output_path.parent() {
                if created_dirs.insert(parent.to_path_buf()) {
                    fs::create_dir_all(parent).map_err(|e| {
                        format!("Failed to create parent directory during extraction: {e}")
                    })?;
                }
            }

            let output_file = File::create(&output_path)
                .map_err(|e| format!("Failed to create extracted file: {e}"))?;
            let mut output = BufWriter::with_capacity(ZIP_COPY_BUFFER_SIZE, output_file);
            copy_with_reused_buffer(&mut entry, &mut output, &mut copy_buffer)
                .map_err(|e| format!("Failed to extract zip entry: {e}"))?;
            output
                .flush()
                .map_err(|e| format!("Failed to flush extracted file output: {e}"))?;

            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&output_path, fs::Permissions::from_mode(mode));
            }
        }

        let current = i + 1;
        // 件数差分と経過時間の両方で進捗発火し、重いエントリ中の無反応を避ける。
        let should_emit_progress = current == total
            || current.saturating_sub(last_reported) >= progress_step
            || last_progress_emitted_at.elapsed() >= EXTRACT_PROGRESS_MIN_INTERVAL;
        if should_emit_progress {
            on_progress(current, total);
            last_reported = current;
            last_progress_emitted_at = Instant::now();
        }
    }

    Ok(())
}
