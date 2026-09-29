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
    stream.read_exact(&mut length).map_err(|error| {
        if error.kind() == io::ErrorKind::UnexpectedEof {
            TransportError::Malformed("truncated frame length".to_owned())
        } else {
            TransportError::Io(error)
        }
    })?;
    let length = u32::from_be_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(TransportError::Malformed(format!(
            "invalid frame length {length}"
        )));
    }
    let mut bytes = vec![0_u8; length];
    stream.read_exact(&mut bytes).map_err(|error| {
        if error.kind() == io::ErrorKind::UnexpectedEof {
            TransportError::Malformed("truncated frame payload".to_owned())
        } else {
            TransportError::Io(error)
        }
    })?;
    String::from_utf8(bytes)
        .map_err(|_| TransportError::Malformed("frame is not valid UTF-8".to_owned()))
}

/// Reads one frame, returning None only when the peer cleanly closes before
/// sending any frame bytes. A partial length or payload remains an error.
pub fn read_frame_or_eof(stream: &mut impl Read) -> Result<Option<String>, TransportError> {
    let mut first = [0_u8; 1];
    let count = stream.read(&mut first)?;
    if count == 0 {
        return Ok(None);
    }
    let mut length = [0_u8; 4];
    length[0] = first[0];
    stream.read_exact(&mut length[1..]).map_err(|error| {
        if error.kind() == io::ErrorKind::UnexpectedEof {
            TransportError::Malformed("truncated frame length".to_owned())
        } else {
            TransportError::Io(error)
        }
    })?;
    let length = u32::from_be_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(TransportError::Malformed(format!(
            "invalid frame length {length}"
        )));
    }
    let mut bytes = vec![0_u8; length];
    stream.read_exact(&mut bytes).map_err(|error| {
        if error.kind() == io::ErrorKind::UnexpectedEof {
            TransportError::Malformed("truncated frame payload".to_owned())
        } else {
            TransportError::Io(error)
        }
    })?;
    Ok(Some(String::from_utf8(bytes).map_err(|_| {
        TransportError::Malformed("frame is not valid UTF-8".to_owned())
    })?))
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

    #[test]
    fn clean_eof_is_distinct_from_truncated_first_frame() {
        let mut empty: &[u8] = &[];
        assert_eq!(read_frame_or_eof(&mut empty).unwrap(), None);

        let mut partial_length: &[u8] = &[0, 0];
        assert!(matches!(
            read_frame_or_eof(&mut partial_length),
            Err(TransportError::Malformed(message)) if message.contains("length")
        ));

        let mut partial_payload: &[u8] = &[0, 0, 0, 4, b'{'];
        assert!(matches!(
            read_frame_or_eof(&mut partial_payload),
            Err(TransportError::Malformed(message)) if message.contains("payload")
        ));

        let mut invalid_utf8: &[u8] = &[0, 0, 0, 1, 0xff];
        assert!(matches!(
            read_frame_or_eof(&mut invalid_utf8),
            Err(TransportError::Malformed(message)) if message.contains("UTF-8")
        ));
    }
}
