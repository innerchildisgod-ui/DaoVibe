use clap::{Args, Parser, Subcommand};
use daovibe_desktop_node::{
    consistency::MyceliumConsistencyReport,
    invite::PeerInvite,
    mycelium::MyceliumStateSnapshot,
    node::{peer_health, DesktopNode},
    protocol::PairingOffer,
};
use std::io::{self, Read};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "daovibe-desktop",
    version,
    about = "DAOVibe independent desktop node foundation"
)]
struct Cli {
    #[arg(
        long,
        global = true,
        value_name = "DIR",
        help = "Directory containing the local SQLite database"
    )]
    data_dir: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}
#[derive(Subcommand, Debug)]
enum Command {
    Identity,
    SetName {
        name: String,
    },
    Pairing {
        #[command(subcommand)]
        command: PairingCommand,
    },
    Listen(ListenArgs),
    Ledger {
        #[command(subcommand)]
        command: LedgerCommand,
    },
    State,
    StateHash,
    MyceliumCheck,
    SyncStatus,
    Peer {
        #[command(subcommand)]
        command: PeerCommand,
    },
}
#[derive(Subcommand, Debug)]
enum PeerCommand {
    List,
    Add(PeerAddArgs),
    Remove {
        node_id: String,
    },
    Sync {
        node_id: String,
    },
    Diagnose {
        node_id: String,
    },
    SyncAll,
    Invite {
        #[command(subcommand)]
        command: InviteCommand,
    },
}
#[derive(Subcommand, Debug)]
enum InviteCommand {
    Create(InviteCreateArgs),
    Parse { payload: String },
    Import { payload: String },
}
#[derive(Args, Debug)]
struct InviteCreateArgs {
    host: String,
    port: u16,
    pairing_id: String,
    #[arg(long)]
    expires_at: Option<i64>,
    #[arg(long, default_value_t = 86_400)]
    ttl_seconds: i64,
    #[arg(long)]
    note: Option<String>,
}
#[derive(Args, Debug)]
struct PeerAddArgs {
    node_id: String,
    host: String,
    port: u16,
    pairing_id: String,
    #[arg(long)]
    name: Option<String>,
}
#[derive(Subcommand, Debug)]
enum PairingCommand {
    Offer(OfferArgs),
    List,
}
#[derive(Args, Debug)]
struct OfferArgs {
    #[arg(
        value_name = "PATH_OR_JSON",
        help = "Path to a PairingOffer JSON file, or '-' for stdin"
    )]
    input: String,
    #[arg(
        long,
        conflicts_with = "reject",
        help = "Approve without an interactive prompt"
    )]
    yes: bool,
    #[arg(
        long,
        conflicts_with = "yes",
        help = "Reject without an interactive prompt"
    )]
    reject: bool,
    #[arg(
        long,
        value_name = "FILE",
        help = "Write clean canonical PairingApproval JSON to this file"
    )]
    output: Option<PathBuf>,
}
#[derive(Args, Debug)]
struct ListenArgs {
    #[arg(long, default_value = "127.0.0.1", help = "Local bind address")]
    host: String,
    #[arg(
        long,
        default_value_t = 4242,
        help = "TCP port (0 chooses a free port)"
    )]
    port: u16,
}
#[derive(Subcommand, Debug)]
enum LedgerCommand {
    Status,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let data_dir = cli.data_dir.unwrap_or_else(default_data_dir);
    let node = DesktopNode::open(data_dir)?;
    match cli.command {
        Command::Identity => {
            let identity = node.ensure_identity()?;
            println!(
                "Node ID: {}\nDisplay name: {}\nPlatform: {}\nRole: {}\nCreated at: {}",
                identity.node_id,
                identity.display_name,
                identity.platform,
                identity.role,
                identity.created_at
            );
        }
        Command::SetName { name } => {
            let identity = node.set_name(&name)?;
            println!(
                "Display name updated: {}\nNode ID unchanged: {}",
                identity.display_name, identity.node_id
            );
        }
        Command::Pairing { command } => match command {
            PairingCommand::Offer(args) => pairing_offer(&node, args)?,
            PairingCommand::List => {
                for pairing in node.store.pairings()? {
                    println!(
                        "{}  {}  {}  {}",
                        pairing.status,
                        pairing.remote_node_id,
                        pairing.remote_display_name,
                        pairing.pairing_id
                    );
                }
            }
        },
        Command::Listen(args) => {
            let identity = node.ensure_identity()?;
            println!("Desktop node: {}", identity.node_id);
            node.listen(&args.host, args.port)?;
        }
        Command::Ledger {
            command: LedgerCommand::Status,
        } => println!(
            "Packets in authoritative ledger: {}",
            node.store.packet_count()?
        ),
        Command::State => {
            let snapshot = MyceliumStateSnapshot::from_store(&node.store)?;
            println!("{}", snapshot.canonical_json());
        }
        Command::StateHash => {
            let snapshot = MyceliumStateSnapshot::from_store(&node.store)?;
            println!("{}", snapshot.fingerprint());
        }
        Command::MyceliumCheck => {
            let report: MyceliumConsistencyReport = node.store.consistency_report(unix_now())?;
            println!("{}", serde_json::to_string_pretty(&report)?);
        }
        Command::SyncStatus => {
            let states = node.store.sync_states()?;
            if states.is_empty() {
                println!("No peer sync cursors stored.");
            } else {
                for (state, pairing, cursor, updated) in states {
                    println!(
                        "remote={} pairing={} cursor={} updated_at={}",
                        state, pairing, cursor, updated
                    );
                }
            }
        }
        Command::Peer { command } => match command {
            PeerCommand::List => {
                for peer in node.store.peers()? {
                    println!(
                        "{} {}:{} pairing={} health={}{}{}",
                        peer.remote_node_id,
                        peer.host,
                        peer.port,
                        peer.pairing_id,
                        peer_health(&peer, unix_now()),
                        peer.last_error
                            .as_deref()
                            .map(|v| format!(" error={v}"))
                            .unwrap_or_default(),
                        peer.last_diagnostic_outcome
                            .as_deref()
                            .map(|v| format!(
                                " diagnose={v}/{}",
                                peer.last_diagnostic_stage.as_deref().unwrap_or("unknown")
                            ))
                            .unwrap_or_default()
                    );
                }
            }
            PeerCommand::Add(args) => {
                let remote = args.node_id.trim().to_owned();
                node.add_peer(&remote, &args.host, args.port, &args.pairing_id, args.name)?;
                println!("Peer configuration saved for {remote}");
            }
            PeerCommand::Remove { node_id } => {
                node.store.remove_peer(&node_id)?;
                println!("Peer configuration removed: {node_id}");
            }
            PeerCommand::Sync { node_id } => {
                let result = node.sync_peer_result(&node_id);
                println!("{}", format_peer_result(&result));
            }
            PeerCommand::Diagnose { node_id } => {
                println!(
                    "{}",
                    format_peer_diagnose_result(&node.diagnose_peer_result(&node_id))
                );
            }
            PeerCommand::SyncAll => {
                for peer in node.store.peers()? {
                    println!(
                        "{}",
                        format_peer_result(&node.sync_peer_result(&peer.remote_node_id))
                    );
                }
            }
            PeerCommand::Invite { command } => match command {
                InviteCommand::Create(args) => {
                    let created_at = unix_now();
                    let expires_at = args.expires_at.unwrap_or(created_at + args.ttl_seconds);
                    let invite = node.create_peer_invite(
                        &args.host,
                        args.port,
                        &args.pairing_id,
                        expires_at,
                        args.note,
                    )?;
                    println!("canonical_json={}", invite.canonical_json()?);
                    println!("payload={}", invite.payload()?);
                    println!("invite_id={}", invite.invite_id()?);
                }
                InviteCommand::Parse { payload } => {
                    let invite = parse_invite(&payload)?;
                    println!("canonical_json={}", invite.canonical_json()?);
                    println!("invite_id={}", invite.invite_id()?);
                    println!(
                        "source={} endpoint={}:{} expires_at={}",
                        invite.source_node_id, invite.host, invite.port, invite.expires_at
                    );
                }
                InviteCommand::Import { payload } => {
                    let invite = parse_invite(&payload)?;
                    node.import_peer_invite(&invite)?;
                    println!(
                        "Peer metadata imported for {} (no connection started)",
                        invite.source_node_id
                    );
                }
            },
        },
    }
    Ok(())
}
fn format_peer_result(result: &daovibe_desktop_node::node::PeerSyncResult) -> String {
    format!("remote={} outcome={:?} stage={} category={} attempts={} imported={} duplicates={} cursor={} message={}", result.remote_node_id, result.outcome, result.stage, result.error_category.as_ref().map(ToString::to_string).unwrap_or_else(|| "none".to_owned()), result.attempts, result.imported_packets, result.duplicate_packets, result.cursor.as_deref().unwrap_or("none"), result.message.as_deref().unwrap_or("none"))
}
fn format_peer_diagnose_result(result: &daovibe_desktop_node::node::PeerDiagnoseResult) -> String {
    format!(
        "remote={} outcome={:?} stage={} category={} latency_ms={} message={}",
        result.remote_node_id,
        result.outcome,
        result.stage,
        result
            .error_category
            .as_ref()
            .map(ToString::to_string)
            .unwrap_or_else(|| "none".to_owned()),
        result
            .latency_ms
            .map(|v| v.to_string())
            .unwrap_or_else(|| "none".to_owned()),
        result.message.as_deref().unwrap_or("none")
    )
}
fn parse_invite(payload: &str) -> Result<PeerInvite, Box<dyn std::error::Error>> {
    let now = unix_now();
    if payload.trim_start().starts_with('{') {
        Ok(PeerInvite::decode_canonical(payload.trim(), now)?)
    } else {
        Ok(PeerInvite::decode_payload(payload.trim(), now)?)
    }
}
fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
fn pairing_offer(node: &DesktopNode, args: OfferArgs) -> Result<(), Box<dyn std::error::Error>> {
    let json = read_input(&args.input)?;
    let value: serde_json::Value = serde_json::from_str(&json)?;
    let offer = PairingOffer::decode(&value)?;
    println!("Pairing request:\n  Node ID: {}\n  Display name: {}\n  Platform: {}\n  Role: {}\n  Pairing ID: {}",offer.source_node_id,offer.source_display_name,offer.source_platform,offer.source_role,offer.pairing_id);
    let approved = if args.yes {
        true
    } else if args.reject {
        false
    } else {
        print!("Approve this pairing? [y/N] ");
        use std::io::Write;
        io::stdout().flush()?;
        let mut answer = String::new();
        io::stdin().read_line(&mut answer)?;
        matches!(answer.trim().to_ascii_lowercase().as_str(), "y" | "yes")
    };
    let approval = node.create_approval(&offer, approved)?;
    let approval_json = approval.canonical_json();
    if let Some(path) = args.output {
        std::fs::write(&path, format!("{approval_json}\n"))?;
        println!("Pairing approval written to {}", path.display());
    } else {
        println!("{approval_json}");
    }
    Ok(())
}
fn read_input(input: &str) -> io::Result<String> {
    if input == "-" {
        let mut value = String::new();
        io::stdin().read_to_string(&mut value)?;
        Ok(value)
    } else if std::path::Path::new(input).is_file() {
        std::fs::read_to_string(input)
    } else {
        Ok(input.to_owned())
    }
}
fn default_data_dir() -> PathBuf {
    if let Ok(value) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(value).join("DAOVibe");
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".daovibe-desktop")
}

#[cfg(test)]
mod tests {
    use daovibe_desktop_node::protocol::PairingApproval;

    #[test]
    fn approval_export_writes_canonical_json_only() {
        let approval = PairingApproval {
            protocol_version: "daovibe-pairing-v1".to_owned(),
            pairing_id: "pairing_test".to_owned(),
            approving_node_id: "desktop_node".to_owned(),
            approving_display_name: "Desktop".to_owned(),
            approving_platform: "desktop".to_owned(),
            approving_role: "computer".to_owned(),
            target_node_id: "android_node".to_owned(),
            approved_at: 1_700_000_001,
            approval_state: "approved".to_owned(),
            challenge_echo: Some("challenge".to_owned()),
        };
        let path = std::env::temp_dir().join(format!(
            "daovibe-approval-export-{}.json",
            std::process::id()
        ));
        let json = approval.canonical_json();
        std::fs::write(&path, format!("{json}\n")).unwrap();

        let exported = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(path).unwrap();

        assert_eq!(exported, format!("{json}\n"));
        let decoded: serde_json::Value = serde_json::from_str(&exported).unwrap();
        assert_eq!(decoded["protocol_version"], "daovibe-pairing-v1");
        assert_eq!(decoded["pairing_id"], "pairing_test");
    }
}
