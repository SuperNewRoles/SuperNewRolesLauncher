use base64::Engine;
use keyring::{Entry, Error};
use serde::{de::DeserializeOwned, Serialize};
use std::marker::PhantomData;

const DEFAULT_CHUNK_SIZE: usize = 1000;
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

pub struct KeyringStorage<T> {
    service: &'static str,
    base_key: &'static str,
    _marker: PhantomData<T>,
}

impl<T> KeyringStorage<T>
where
    T: Serialize + DeserializeOwned,
{
    pub const fn new(service: &'static str, base_key: &'static str) -> Self {
        Self {
            service,
            base_key,
            _marker: PhantomData,
        }
    }

    fn entry(&self, suffix: &str) -> Result<Entry, String> {
        Entry::new(self.service, &format!("{}_{}", self.base_key, suffix))
            .map_err(|e| format!("Failed to open keyring chunk entry: {e}"))
    }

    fn legacy_entry(&self) -> Result<Entry, String> {
        Entry::new(self.service, self.base_key)
            .map_err(|e| format!("Failed to open keyring legacy entry: {e}"))
    }

    fn delete_if_exists(entry: &Entry) -> Result<(), String> {
        match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("Failed to clear keyring entry: {error}")),
        }
    }

    fn try_load_chunked(&self) -> Option<T> {
        let count_entry = self.entry("n").ok()?;
        let count: usize = count_entry.get_password().ok()?.parse().ok()?;
        if count == 0 {
            return None;
        }

        let mut encoded = String::new();
        for index in 0..count {
            let chunk = self.entry(&index.to_string()).ok()?.get_password().ok()?;
            encoded.push_str(&chunk);
        }

        let decoded = B64.decode(encoded).ok()?;
        serde_json::from_slice(&decoded).ok()
    }

    fn try_load_legacy(&self) -> Option<T> {
        let entry = self.legacy_entry().ok()?;
        match entry.get_password() {
            Ok(json) => serde_json::from_str(&json).ok(),
            Err(Error::NoEntry) => None,
            Err(_) => None,
        }
    }

    pub fn save(&self, value: &T) -> Result<(), String> {
        self.clear()?;

        let json =
            serde_json::to_vec(value).map_err(|e| format!("Failed to serialize data: {e}"))?;
        let encoded = B64.encode(json);
        let chunks: Vec<&[u8]> = encoded.as_bytes().chunks(DEFAULT_CHUNK_SIZE).collect();

        self.entry("n")?
            .set_password(&chunks.len().to_string())
            .map_err(|e| format!("Failed to store keyring chunk count: {e}"))?;

        for (index, chunk) in chunks.iter().enumerate() {
            let chunk_str =
                std::str::from_utf8(chunk).map_err(|e| format!("Invalid UTF-8 chunk: {e}"))?;
            self.entry(&index.to_string())?
                .set_password(chunk_str)
                .map_err(|e| format!("Failed to store keyring chunk {index}: {e}"))?;
        }

        Ok(())
    }

    pub fn load(&self) -> Option<T> {
        self.try_load_chunked().or_else(|| self.try_load_legacy())
    }

    pub fn clear(&self) -> Result<(), String> {
        if let Ok(legacy) = self.legacy_entry() {
            let _ = Self::delete_if_exists(&legacy);
        }

        let count = if let Ok(entry) = self.entry("n") {
            entry
                .get_password()
                .ok()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(0)
        } else {
            0
        };

        if let Ok(count_entry) = self.entry("n") {
            let _ = Self::delete_if_exists(&count_entry);
        }

        for index in 0..count {
            if let Ok(chunk_entry) = self.entry(&index.to_string()) {
                let _ = Self::delete_if_exists(&chunk_entry);
            }
        }

        Ok(())
    }
}
