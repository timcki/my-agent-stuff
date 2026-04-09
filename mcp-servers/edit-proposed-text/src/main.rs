use std::{
    borrow::Cow, env, fs::Permissions, future::Future, os::unix::fs::PermissionsExt, path::Path,
    time::Duration,
};

use rmcp::{
    handler::server::tool::Parameters,
    model::{
        CallToolResult, Content, ErrorCode, ErrorData, Implementation, ProtocolVersion,
        ServerCapabilities, ServerInfo,
    },
    schemars, tool, tool_handler, tool_router,
    transport::stdio,
    ServerHandler, ServiceExt,
};
use serde::Deserialize;
use tokio::{fs, time::sleep};

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct EditRequest {
    #[schemars(description = "The text to open for editing")]
    text: String,

    #[schemars(description = "Short label for what the text is (default: 'proposed text')")]
    purpose: Option<String>,

    #[schemars(description = "File extension for the temp file (default: 'md')")]
    file_extension: Option<String>,

    #[schemars(description = "Open in a zellij floating pane (default: true)")]
    floating: Option<bool>,

    #[schemars(description = "Max seconds to wait for editor to close (default: 1800)")]
    timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone)]
struct EditServer {
    tool_router: rmcp::handler::server::router::tool::ToolRouter<EditServer>,
}

fn internal_error(context: &str, err: impl std::fmt::Display) -> ErrorData {
    ErrorData {
        code: ErrorCode::INTERNAL_ERROR,
        message: Cow::from(format!("{context}: {err}")),
        data: None,
    }
}

fn resolve_editor() -> String {
    env::var("PI_EDIT_TEXT_EDITOR")
        .or_else(|_| env::var("VISUAL"))
        .or_else(|_| env::var("EDITOR"))
        .unwrap_or_else(|_| "nvim".into())
}

fn sanitize_extension(ext: Option<&str>) -> &str {
    ext.filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("md")
}

const EDITOR_SCRIPT: &str = r#"#!/usr/bin/env bash
set +e
file="$1"
done_file="$2"
editor_cmd="$3"
[ -z "$editor_cmd" ] && editor_cmd="nvim"
bash -lc "$editor_cmd \"$file\""
printf "%s\n" "$?" > "$done_file"
"#;

async fn launch_zellij(
    script: &Path,
    text: &Path,
    done: &Path,
    editor: &str,
    floating: bool,
) -> std::io::Result<bool> {
    let mut cmd = tokio::process::Command::new("zellij");
    cmd.arg("run").arg("--close-on-exit");

    if floating {
        cmd.arg("--floating").arg("--pinned").arg("true");
    }

    let status = cmd
        .arg("--name")
        .arg("edit-proposed-text")
        .arg("--")
        .arg(script)
        .arg(text)
        .arg(done)
        .arg(editor)
        .status()
        .await?;

    Ok(status.success())
}

#[tool_router]
impl EditServer {
    fn new() -> Self {
        Self {
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Open text in the user's editor (via zellij pane) for editing, then return the edited text"
    )]
    async fn edit_proposed_text(
        &self,
        Parameters(req): Parameters<EditRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if env::var("ZELLIJ_SESSION_NAME").is_err() {
            return Ok(CallToolResult::error(vec![Content::text(
                "Error: not running inside zellij. edit_proposed_text requires a zellij session.",
            )]));
        }

        let editor = resolve_editor();
        let ext = sanitize_extension(req.file_extension.as_deref());
        let floating = req.floating.unwrap_or(true);
        let timeout = Duration::from_secs(req.timeout_seconds.unwrap_or(1800));
        let purpose = req.purpose.as_deref().unwrap_or("proposed text");

        let tmp_dir =
            tempfile::tempdir().map_err(|e| internal_error("failed to create temp dir", e))?;

        let text_path = tmp_dir.path().join(format!("draft.{ext}"));
        let done_path = tmp_dir.path().join("editor.done");
        let script_path = tmp_dir.path().join("run-editor.sh");

        fs::write(&text_path, &req.text)
            .await
            .map_err(|e| internal_error("failed to write draft", e))?;
        fs::write(&script_path, EDITOR_SCRIPT)
            .await
            .map_err(|e| internal_error("failed to write script", e))?;
        fs::set_permissions(&script_path, Permissions::from_mode(0o755))
            .await
            .map_err(|e| internal_error("failed to chmod script", e))?;

        // try floating first, fall back to embedded pane
        let launched = if floating {
            match launch_zellij(&script_path, &text_path, &done_path, &editor, true).await {
                Ok(true) => true,
                _ => {
                    tracing::warn!("floating pane failed, retrying as embedded pane");
                    launch_zellij(&script_path, &text_path, &done_path, &editor, false)
                        .await
                        .unwrap_or(false)
                }
            }
        } else {
            launch_zellij(&script_path, &text_path, &done_path, &editor, false)
                .await
                .unwrap_or(false)
        };

        if !launched {
            return Ok(CallToolResult::error(vec![Content::text(
                "Error: failed to launch editor via zellij.",
            )]));
        }

        tracing::info!("waiting for user to edit {purpose}");

        // poll for editor completion
        let start = tokio::time::Instant::now();
        loop {
            if fs::metadata(&done_path).await.is_ok() {
                tracing::info!("done file detected after {:?}", start.elapsed());
                break;
            }
            if start.elapsed() > timeout {
                return Ok(CallToolResult::error(vec![Content::text(
                    "Error: timed out waiting for editor to close.",
                )]));
            }
            sleep(Duration::from_millis(200)).await;
        }

        // check editor exit code
        let exit_code_raw = fs::read_to_string(&done_path)
            .await
            .map_err(|e| internal_error("failed to read done file", e))?;
        let exit_code: i32 = exit_code_raw.trim().parse().unwrap_or(-1);
        if exit_code != 0 {
            return Ok(CallToolResult::error(vec![Content::text(format!(
                "Error: editor exited with code {exit_code}.",
            ))]));
        }

        let edited = fs::read_to_string(&text_path)
            .await
            .map_err(|e| internal_error("failed to read edited text", e))?;

        tracing::info!("returning edited text after {:?}", start.elapsed());
        Ok(CallToolResult::success(vec![Content::text(edited)]))
    }
}

#[tool_handler]
impl ServerHandler for EditServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            capabilities: ServerCapabilities::builder().enable_tools().build(),
            server_info: Implementation {
                name: "edit-proposed-text".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
            instructions: Some(
                "Opens text in the user's editor via a zellij terminal pane. \
                 Use edit_proposed_text to let the user refine proposed text \
                 (commit messages, PR descriptions, review comments, etc.)."
                    .into(),
            ),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    let service = EditServer::new().serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
