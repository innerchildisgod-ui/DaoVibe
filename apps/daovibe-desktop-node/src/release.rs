use serde::Serialize;

/// The small, deterministic decision vocabulary used by the alpha release
/// checklist. It deliberately does not imply security or production readiness.
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseBlockerStatus {
    Pass,
    Warning,
    Fail,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ReleaseBlocker {
    pub code: String,
    pub status: ReleaseBlockerStatus,
    pub detail: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReleaseBlockerInputs {
    pub build_ok: bool,
    pub tests_ok: bool,
    pub consistency_ok: bool,
    pub fingerprint_compatibility_ok: bool,
    pub invite_compatibility_ok: bool,
    pub migration_compatible: bool,
    pub diagnostics_private: bool,
}

pub fn evaluate_alpha_release(input: &ReleaseBlockerInputs) -> Vec<ReleaseBlocker> {
    [
        blocker("build_failure", input.build_ok, "build and artifact checks"),
        blocker("test_failure", input.tests_ok, "automated test suites"),
        blocker(
            "consistency_failure",
            input.consistency_ok,
            "read-only consistency/readiness",
        ),
        blocker(
            "fingerprint_compatibility_regression",
            input.fingerprint_compatibility_ok,
            "canonical semantic fingerprints",
        ),
        blocker(
            "invite_compatibility_regression",
            input.invite_compatibility_ok,
            "development invite fixture bytes and ID",
        ),
        blocker(
            "migration_schema_incompatibility",
            input.migration_compatible,
            "Room/Rust schema compatibility",
        ),
        blocker(
            "privacy_leak_in_diagnostics",
            input.diagnostics_private,
            "bounded diagnostics privacy exclusions",
        ),
    ]
    .into_iter()
    .chain([
        warning(
            "no_cryptographic_auth",
            "cryptographic authentication is out of scope",
        ),
        warning("manual_peer_configuration", "peers are configured manually"),
        warning("no_discovery", "DHT/gossip/discovery is out of scope"),
        warning(
            "development_pairing_only",
            "pairing is development correlation only",
        ),
    ])
    .collect()
}

fn blocker(code: &str, passed: bool, detail: &str) -> ReleaseBlocker {
    ReleaseBlocker {
        code: code.to_owned(),
        status: if passed {
            ReleaseBlockerStatus::Pass
        } else {
            ReleaseBlockerStatus::Fail
        },
        detail: detail.to_owned(),
    }
}

fn warning(code: &str, detail: &str) -> ReleaseBlocker {
    ReleaseBlocker {
        code: code.to_owned(),
        status: ReleaseBlockerStatus::Warning,
        detail: detail.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alpha_blockers_are_ordered_and_deterministic() {
        let input = ReleaseBlockerInputs {
            build_ok: true,
            tests_ok: true,
            consistency_ok: true,
            fingerprint_compatibility_ok: true,
            invite_compatibility_ok: true,
            migration_compatible: true,
            diagnostics_private: true,
        };
        let first = evaluate_alpha_release(&input);
        let second = evaluate_alpha_release(&input);
        assert_eq!(first, second);
        assert_eq!(first.len(), 11);
        assert!(first[..7]
            .iter()
            .all(|item| item.status == ReleaseBlockerStatus::Pass));
        assert!(first[7..]
            .iter()
            .all(|item| item.status == ReleaseBlockerStatus::Warning));
        assert_eq!(first[0].code, "build_failure");
        assert_eq!(first[6].code, "privacy_leak_in_diagnostics");
        assert_eq!(first[10].code, "development_pairing_only");
    }
}
