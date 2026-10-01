use base64::Engine;
use ed25519_dalek::SigningKey;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub const IDENTITY_KEY_SCHEME: &str = "ed25519";
pub const IDENTITY_KEY_STATE_UNINITIALIZED: &str = "uninitialized";
pub const IDENTITY_KEY_STATE_AVAILABLE: &str = "available";
pub const IDENTITY_KEY_STATE_UNAVAILABLE: &str = "unavailable";
pub const IDENTITY_KEY_STATE_REVOKED: &str = "revoked";
pub const IDENTITY_STORAGE_BACKEND: &str = "windows_dpapi_user";
const KEY_FILE_NAME: &str = "identity-key-v1.bin";
pub(crate) const MAGIC: &[u8] = b"DAOVIBE-IDKEY";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentityCryptoMetadata {
    pub node_id: String,
    pub identity_key_scheme: String,
    pub identity_public_key: String,
    pub identity_key_fingerprint: String,
    pub identity_key_created_at: i64,
    pub identity_key_state: String,
    pub secure_storage_backend: String,
    pub hardware_backed: Option<bool>,
}

#[derive(Debug, Error)]
pub enum IdentityCryptoError {
    #[error("identity secure storage unavailable")]
    Unavailable,
    #[error("identity secure storage corrupt")]
    Corrupt,
    #[error("identity metadata mismatch")]
    Mismatch,
    #[error("identity I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("identity protection failed")]
    Protection,
}

pub fn public_key_base64(public_key: &[u8; 32]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(public_key)
}

pub fn fingerprint(public_key: &[u8; 32]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(public_key))
}

pub fn grouped_fingerprint(value: &str) -> String {
    value
        .as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or(""))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn load_or_create(
    data_dir: &Path,
    node_id: &str,
    existing: Option<&IdentityCryptoMetadata>,
    created_at: i64,
) -> Result<IdentityCryptoMetadata, IdentityCryptoError> {
    let path = data_dir.join(KEY_FILE_NAME);
    if let Some(metadata) = existing {
        if metadata.node_id != node_id || metadata.identity_key_scheme != IDENTITY_KEY_SCHEME {
            return Err(IdentityCryptoError::Mismatch);
        }
        if metadata.identity_key_state == IDENTITY_KEY_STATE_REVOKED {
            return Ok(metadata.clone());
        }
        let seed = read_seed(&path, node_id)?;
        let signing = SigningKey::from_bytes(&seed);
        let public = signing.verifying_key().to_bytes();
        if public_key_base64(&public) != metadata.identity_public_key
            || fingerprint(&public) != metadata.identity_key_fingerprint
        {
            return Err(IdentityCryptoError::Mismatch);
        }
        let mut metadata = metadata.clone();
        metadata.identity_key_state = IDENTITY_KEY_STATE_AVAILABLE.to_owned();
        return Ok(metadata);
    }

    // Recover a secure-first write if metadata persistence was interrupted.
    // Existing material is never replaced with a newly generated key.
    if path.exists() {
        let seed = read_seed(&path, node_id)?;
        let signing = SigningKey::from_bytes(&seed);
        let public = signing.verifying_key().to_bytes();
        return Ok(IdentityCryptoMetadata {
            node_id: node_id.to_owned(),
            identity_key_scheme: IDENTITY_KEY_SCHEME.to_owned(),
            identity_public_key: public_key_base64(&public),
            identity_key_fingerprint: fingerprint(&public),
            identity_key_created_at: created_at,
            identity_key_state: IDENTITY_KEY_STATE_AVAILABLE.to_owned(),
            secure_storage_backend: IDENTITY_STORAGE_BACKEND.to_owned(),
            hardware_backed: None,
        });
    }

    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).map_err(|_| IdentityCryptoError::Unavailable)?;
    let signing = SigningKey::from_bytes(&seed);
    let public = signing.verifying_key().to_bytes();
    write_seed_atomic(&path, node_id, &public, &seed)?;
    Ok(IdentityCryptoMetadata {
        node_id: node_id.to_owned(),
        identity_key_scheme: IDENTITY_KEY_SCHEME.to_owned(),
        identity_public_key: public_key_base64(&public),
        identity_key_fingerprint: fingerprint(&public),
        identity_key_created_at: created_at,
        identity_key_state: IDENTITY_KEY_STATE_AVAILABLE.to_owned(),
        secure_storage_backend: IDENTITY_STORAGE_BACKEND.to_owned(),
        hardware_backed: None,
    })
}

fn dpapi_entropy(node_id: &str) -> Vec<u8> {
    let mut entropy = b"daovibe/identity-dpapi/v1|".to_vec();
    entropy.extend_from_slice(node_id.as_bytes());
    entropy
}

fn protect(input: &[u8], node_id: &str) -> Result<Vec<u8>, IdentityCryptoError> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Security::Cryptography::{
            CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        };
        let entropy = dpapi_entropy(node_id);
        let entropy_blob = CRYPT_INTEGER_BLOB {
            cbData: entropy.len() as u32,
            pbData: entropy.as_ptr() as *mut u8,
        };
        let input_blob = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut output_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = CryptProtectData(
            &input_blob,
            std::ptr::null(),
            &entropy_blob,
            std::ptr::null_mut(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        );
        if ok == 0 {
            return Err(IdentityCryptoError::Protection);
        }
        let output =
            std::slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec();
        windows_sys::Win32::Foundation::LocalFree(output_blob.pbData.cast());
        Ok(output)
    }
    #[cfg(not(windows))]
    {
        let _ = (input, node_id);
        Err(IdentityCryptoError::Unavailable)
    }
}

fn unprotect(input: &[u8], node_id: &str) -> Result<Vec<u8>, IdentityCryptoError> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        };
        let entropy = dpapi_entropy(node_id);
        let entropy_blob = CRYPT_INTEGER_BLOB {
            cbData: entropy.len() as u32,
            pbData: entropy.as_ptr() as *mut u8,
        };
        let input_blob = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut output_blob = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = CryptUnprotectData(
            &input_blob,
            std::ptr::null_mut(),
            &entropy_blob,
            std::ptr::null_mut(),
            std::ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        );
        if ok == 0 {
            return Err(IdentityCryptoError::Protection);
        }
        let output =
            std::slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec();
        windows_sys::Win32::Foundation::LocalFree(output_blob.pbData.cast());
        Ok(output)
    }
    #[cfg(not(windows))]
    {
        let _ = (input, node_id);
        Err(IdentityCryptoError::Unavailable)
    }
}

fn encode_blob(node_id: &str, public: &[u8; 32], protected: &[u8]) -> Vec<u8> {
    let node = node_id.as_bytes();
    let mut out = Vec::with_capacity(MAGIC.len() + 1 + 2 + node.len() + 32 + 4 + protected.len());
    out.extend_from_slice(MAGIC);
    out.push(1);
    out.extend_from_slice(&(node.len() as u16).to_be_bytes());
    out.extend_from_slice(node);
    out.extend_from_slice(public);
    out.extend_from_slice(&(protected.len() as u32).to_be_bytes());
    out.extend_from_slice(protected);
    out
}

fn decode_blob(blob: &[u8], node_id: &str) -> Result<([u8; 32], Vec<u8>), IdentityCryptoError> {
    let mut index = 0usize;
    if blob.len() < MAGIC.len() + 1 + 2 || &blob[..MAGIC.len()] != MAGIC {
        return Err(IdentityCryptoError::Corrupt);
    }
    index += MAGIC.len();
    if blob[index] != 1 {
        return Err(IdentityCryptoError::Corrupt);
    }
    index += 1;
    let len = u16::from_be_bytes([blob[index], blob[index + 1]]) as usize;
    index += 2;
    let fixed_end = index
        .checked_add(len)
        .and_then(|value| value.checked_add(32))
        .and_then(|value| value.checked_add(4))
        .ok_or(IdentityCryptoError::Corrupt)?;
    if blob.len() < fixed_end || &blob[index..index + len] != node_id.as_bytes() {
        return Err(IdentityCryptoError::Mismatch);
    }
    index += len;
    let mut public = [0u8; 32];
    public.copy_from_slice(&blob[index..index + 32]);
    index += 32;
    let protected_len = u32::from_be_bytes([
        blob[index],
        blob[index + 1],
        blob[index + 2],
        blob[index + 3],
    ]) as usize;
    index += 4;
    let end = index
        .checked_add(protected_len)
        .ok_or(IdentityCryptoError::Corrupt)?;
    if blob.len() != end {
        return Err(IdentityCryptoError::Corrupt);
    }
    Ok((public, unprotect(&blob[index..], node_id)?))
}

fn write_seed_atomic(
    path: &Path,
    node_id: &str,
    public: &[u8; 32],
    seed: &[u8; 32],
) -> Result<(), IdentityCryptoError> {
    let protected = protect(seed, node_id)?;
    let temp = PathBuf::from(format!(
        "{}.tmp-{}-{}",
        path.display(),
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    let bytes = encode_blob(node_id, public, &protected);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    // Existing key material is recovered by load_or_create and is never
    // clobbered by a concurrent or repeated initialization attempt.
    if let Err(error) = std::fs::rename(&temp, path) {
        let _ = std::fs::remove_file(&temp);
        return Err(error.into());
    }
    Ok(())
}

fn read_seed(path: &Path, node_id: &str) -> Result<[u8; 32], IdentityCryptoError> {
    let blob = std::fs::read(path).map_err(|_| IdentityCryptoError::Unavailable)?;
    let (public, seed) = decode_blob(&blob, node_id)?;
    if seed.len() != 32
        || SigningKey::from_bytes(
            seed.as_slice()
                .try_into()
                .map_err(|_| IdentityCryptoError::Corrupt)?,
        )
        .verifying_key()
        .to_bytes()
            != public
    {
        return Err(IdentityCryptoError::Mismatch);
    }
    seed.try_into().map_err(|_| IdentityCryptoError::Corrupt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn shared_fixture_matches_public_encoding_and_fingerprint() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../shared/fixtures/mycelium_identity_ed25519.json"
        ))
        .unwrap();
        let seed_hex = fixture["test_only_seed_hex"].as_str().unwrap();
        let mut seed = [0u8; 32];
        hex::decode_to_slice(seed_hex, &mut seed).unwrap();
        let public = SigningKey::from_bytes(&seed).verifying_key().to_bytes();
        assert_eq!(public_key_base64(&public), fixture["public_key_base64url"]);
        assert_eq!(fingerprint(&public), fixture["fingerprint"]);
        assert_eq!(
            grouped_fingerprint(&fingerprint(&public)),
            fixture["grouped_fingerprint"]
        );
    }

    #[test]
    fn malformed_blob_lengths_are_rejected_without_panicking() {
        let cases = [
            Vec::new(),
            MAGIC.to_vec(),
            [MAGIC, &[1, 0]].concat(),
            encode_blob("node", &[0u8; 32], &[1, 2, 3]),
        ];
        for blob in cases {
            assert!(decode_blob(&blob, "node").is_err());
        }
    }

    #[test]
    fn blob_node_binding_is_checked_before_unprotect() {
        let blob = encode_blob("owner", &[0u8; 32], &[1, 2, 3]);
        assert_eq!(
            decode_blob(&blob, "other").unwrap_err().to_string(),
            "identity metadata mismatch"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_dpapi_round_trip_is_user_scoped_and_node_bound() {
        let seed = [7u8; 32];
        let protected = protect(&seed, "node-a").unwrap();
        assert_eq!(unprotect(&protected, "node-a").unwrap(), seed);
        assert!(unprotect(&protected, "node-b").is_err());
    }
}
