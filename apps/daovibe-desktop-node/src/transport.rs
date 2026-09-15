use crate::protocol::MAX_FRAME_BYTES;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TransportError {
    #[error("I/O failure: {0}")]
    Io(#[from] io::Error),
    #[error("malformed frame: {0}")]
    Malformed(String),
}

pub fn write_frame(stream: &mut impl Write, json: &str) -> Result<(), TransportError> {
    let bytes = json.as_bytes();
    if bytes.is_empty() {
        return Err(TransportError::Malformed(
            "frame must not be empty".to_owned(),
        ));
    }
    if bytes.len() > MAX_FRAME_BYTES {
        return Err(TransportError::Malformed(format!(
            "frame exceeds {MAX_FRAME_BYTES} bytes"
        )));
    }
    stream.write_all(&(bytes.len() as u32).to_be_bytes())?;
    stream.write_all(bytes)?;
    stream.flush()?;
    Ok(())
}
pub fn read_frame(stream: &mut impl Read) -> Result<String, TransportError> {
    let mut length = [0_u8; 4];
    stream.read_exact(&mut length)?;
    let length = u32::from_be_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(TransportError::Malformed(format!(
            "invalid frame length {length}"
        )));
    }
    let mut bytes = vec![0_u8; length];
    stream.read_exact(&mut bytes)?;
    String::from_utf8(bytes)
        .map_err(|_| TransportError::Malformed("frame is not valid UTF-8".to_owned()))
}
pub fn configure_stream(stream: &TcpStream) -> Result<(), TransportError> {
    stream.set_read_timeout(Some(Duration::from_secs(8)))?;
    stream.set_write_timeout(Some(Duration::from_secs(8)))?;
    stream.set_nodelay(true)?;
    Ok(())
}
pub fn bind(host: &str, port: u16) -> Result<TcpListener, TransportError> {
    Ok(TcpListener::bind((host, port))?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn framing_is_big_endian_and_bounded() {
        let mut bytes = Vec::new();
        write_frame(&mut bytes, "{}").unwrap();
        assert_eq!(&bytes[..4], &[0, 0, 0, 2]);
        assert_eq!(read_frame(&mut bytes.as_slice()).unwrap(), "{}");
        assert!(write_frame(&mut Vec::new(), &"x".repeat(MAX_FRAME_BYTES + 1)).is_err());
    }
}
