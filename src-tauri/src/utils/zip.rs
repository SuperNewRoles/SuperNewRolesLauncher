use std::fs::{self, File};
use std::path::Path;

pub fn extract_zip<F>(zip_path: &Path, destination: &Path, mut on_progress: F) -> Result<(), String>
where
    F: FnMut(usize, usize),
{
    let file = File::open(zip_path).map_err(|e| format!("Failed to open zip archive: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive format: {e}"))?;

    fs::create_dir_all(destination)
        .map_err(|e| format!("Failed to create extraction directory: {e}"))?;

    let total = archive.len();
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
            fs::create_dir_all(&output_path)
                .map_err(|e| format!("Failed to create directory during extraction: {e}"))?;
        } else {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!("Failed to create parent directory during extraction: {e}")
                })?;
            }

            let mut output = File::create(&output_path)
                .map_err(|e| format!("Failed to create extracted file: {e}"))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|e| format!("Failed to extract zip entry: {e}"))?;

            #[cfg(unix)]
            if let Some(mode) = entry.unix_mode() {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&output_path, fs::Permissions::from_mode(mode));
            }
        }

        on_progress(i + 1, total);
    }

    Ok(())
}
