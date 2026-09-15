use serde_json::Value;
use std::fmt::Write;

/// The Android StableJson contract: lexicographically sorted object keys,
/// insertion-preserving arrays, compact UTF-8 JSON, and no insignificant
/// whitespace. Protocol numbers are intentionally restricted to JSON values
/// accepted by serde_json; packet confidence values are finite f64 values.
pub fn stringify(value: &Value) -> String {
    let mut output = String::new();
    write_value(value, &mut output);
    output
}

fn write_value(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => output.push_str(&number_text(value)),
        Value::String(value) => write!(
            output,
            "{}",
            serde_json::to_string(value).expect("string is serializable")
        )
        .unwrap(),
        Value::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
                write_value(value, output);
            }
            output.push(']');
        }
        Value::Object(values) => {
            output.push('{');
            let mut keys: Vec<&str> = values.keys().map(String::as_str).collect();
            keys.sort_unstable();
            for (index, key) in keys.iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
                write_value(&Value::String((*key).to_owned()), output);
                output.push(':');
                write_value(&values[*key], output);
            }
            output.push('}');
        }
    }
}

fn number_text(value: &serde_json::Number) -> String {
    // Android calls BigDecimal.valueOf(double).stripTrailingZeros().toPlainString().
    // Expand serde_json's shortest-round-trip exponent form before removing
    // insignificant zeroes so values such as 1.0 and 1e-7 match Kotlin.
    let raw = value.to_string();
    let negative = raw.starts_with('-');
    let unsigned = raw.strip_prefix('-').unwrap_or(&raw);
    let (mantissa, exponent) = unsigned
        .split_once(['e', 'E'])
        .map(|(mantissa, exponent)| (mantissa, exponent.parse::<i32>().unwrap_or(0)))
        .unwrap_or((unsigned, 0));
    let mut digits = mantissa.replace('.', "");
    let decimal_before = mantissa.find('.').unwrap_or(mantissa.len()) as i32 + exponent;
    if decimal_before >= digits.len() as i32 {
        digits.extend(std::iter::repeat_n(
            '0',
            decimal_before as usize - digits.len(),
        ));
    } else if decimal_before <= 0 {
        digits = format!("0.{}{}", "0".repeat((-decimal_before) as usize), digits);
    } else {
        digits.insert(decimal_before as usize, '.');
    }
    if let Some(dot) = digits.find('.') {
        while digits.ends_with('0') {
            digits.pop();
        }
        if digits.ends_with('.') {
            digits.pop();
        }
        if dot == 0 {
            digits.insert(0, '0');
        }
    }
    while digits.starts_with('0') && digits.len() > 1 && !digits.starts_with("0.") {
        digits.remove(0);
    }
    if digits == "0" || digits == "0.0" {
        return "0".to_owned();
    }
    if negative {
        format!("-{digits}")
    } else {
        digits
    }
}

pub fn parse_and_stringify(json: &str) -> Result<String, serde_json::Error> {
    Ok(stringify(&serde_json::from_str(json)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sorts_objects_and_keeps_arrays() {
        assert_eq!(
            stringify(&json!({"z": 1, "a": {"b": true, "a": ["one", 2]}})),
            r#"{"a":{"a":["one",2],"b":true},"z":1}"#
        );
    }

    #[test]
    fn escapes_like_json_and_normalises_negative_zero() {
        assert_eq!(
            stringify(&json!({"v": -0.0, "s": "line\n"})),
            r#"{"s":"line\n","v":0}"#
        );
        assert_eq!(
            stringify(&json!({"a": 1.0, "b": 1e-7, "c": 1e20})),
            r#"{"a":1,"b":0.0000001,"c":100000000000000000000}"#
        );
    }
}
