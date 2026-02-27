import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

type Params = {
	text: string;
	purpose?: string;
	floating?: boolean;
	fileExtension?: string;
	editorCommand?: string;
	timeoutSeconds?: number;
	cleanup?: boolean;
};

type EditMode = "zellij-floating" | "zellij-pane" | "ui-editor";

type EditDetails = {
	ok: boolean;
	mode?: EditMode;
	changed?: boolean;
	cancelled?: boolean;
	reason?: "no-interactive-ui" | "zellij-launch-failed" | "timeout" | "aborted";
	code?: number;
	exitCode?: number | null;
	stderr?: string;
	tempFile?: string;
};

type EditResult = {
	text: string;
	details: EditDetails;
};

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function sanitizeExtension(ext: string | undefined): string {
	if (!ext) return "md";
	const cleaned = ext.replace(/[^a-zA-Z0-9]/g, "");
	return cleaned.length > 0 ? cleaned : "md";
}

function getEditorCommand(params: Params): string {
	return params.editorCommand ?? process.env.PI_EDIT_TEXT_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR ?? "nvim";
}

function getLaunchArgs(options: {
	cwd: string;
	floating: boolean;
	scriptPath: string;
	textPath: string;
	donePath: string;
	editorCommand: string;
}): string[] {
	const args = ["run", "--close-on-exit", "--cwd", options.cwd];
	if (options.floating) args.push("--floating", "--pinned", "true");
	args.push(
		"--name",
		"pi-edit",
		"--",
		options.scriptPath,
		options.textPath,
		options.donePath,
		options.editorCommand,
	);
	return args;
}

function getLastAssistantText(ctx: ExtensionContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i] as any;
		if (entry?.type !== "message") continue;
		const message = entry?.message;
		if (!message || message.role !== "assistant" || !Array.isArray(message.content)) continue;
		const text = message.content
			.filter((part: any) => part?.type === "text" && typeof part.text === "string")
			.map((part: any) => part.text)
			.join("\n")
			.trim();
		if (text.length > 0) return text;
	}
	return undefined;
}

async function editText(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	params: Params,
	signal?: AbortSignal,
): Promise<EditResult> {
	const originalText = params.text;
	const purpose = params.purpose ?? "proposed text";
	const floating = params.floating ?? true;
	const fileExtension = sanitizeExtension(params.fileExtension);
	const timeoutMs = Math.max(1000, Math.floor((params.timeoutSeconds ?? 1800) * 1000));
	const cleanup = params.cleanup ?? true;
	const editorCommand = getEditorCommand(params);
	const inZellij = Boolean(process.env.ZELLIJ_SESSION_NAME);

	if (!ctx.hasUI && !inZellij) {
		return {
			text: originalText,
			details: { ok: false, reason: "no-interactive-ui" },
		};
	}

	const tmpPath = await mkdtemp(join(tmpdir(), "pi-edit-proposed-text-"));
	const textPath = join(tmpPath, `draft.${fileExtension}`);
	const donePath = join(tmpPath, "editor.done");
	const scriptPath = join(tmpPath, "run-editor.sh");

	const runEditorScript = `#!/usr/bin/env bash
set +e
file="$1"
done_file="$2"
editor_cmd="$3"
if [ -z "$editor_cmd" ]; then
	editor_cmd="nvim"
fi

export PI_EDIT_TEXT_FILE="$file"

if [[ "$editor_cmd" == *"{file}"* ]]; then
	cmd="$(printf '%s' "$editor_cmd" | sed 's#{file}#"$PI_EDIT_TEXT_FILE"#g')"
	bash -lc "$cmd"
elif [[ "$editor_cmd" == *"\$1"* ]]; then
	bash -lc "$editor_cmd" -- "$PI_EDIT_TEXT_FILE"
else
	bash -lc "$editor_cmd \"\$PI_EDIT_TEXT_FILE\""
fi

exit_code=$?
printf "%s\n" "$exit_code" > "$done_file"
`;

	try {
		await writeFile(textPath, originalText, "utf8");
		await writeFile(scriptPath, runEditorScript, "utf8");
		await chmod(scriptPath, 0o755);

		if (inZellij) {
			let mode: EditMode = floating ? "zellij-floating" : "zellij-pane";

			let launch = await pi.exec(
				"zellij",
				getLaunchArgs({
					cwd: ctx.cwd,
					floating,
					scriptPath,
					textPath,
					donePath,
					editorCommand,
				}),
				{ signal },
			);

			if (launch.code !== 0 && floating) {
				launch = await pi.exec(
					"zellij",
					getLaunchArgs({
						cwd: ctx.cwd,
						floating: false,
						scriptPath,
						textPath,
						donePath,
						editorCommand,
					}),
					{ signal },
				);
				mode = "zellij-pane";
			}

			if (launch.code !== 0) {
				if (!ctx.hasUI) {
					return {
						text: originalText,
						details: {
							ok: false,
							reason: "zellij-launch-failed",
							code: launch.code,
							stderr: launch.stderr,
						},
					};
				}

				const editedViaUi = await ctx.ui.editor(`Edit ${purpose}`, originalText);
				const finalUiText = editedViaUi ?? originalText;
				return {
					text: finalUiText,
					details: {
						ok: true,
						mode: "ui-editor",
						changed: finalUiText !== originalText,
						cancelled: editedViaUi === undefined,
					},
				};
			}

			const start = Date.now();
			while (!(await fileExists(donePath))) {
				if (signal?.aborted) {
					return {
						text: originalText,
						details: { ok: false, reason: "aborted", mode },
					};
				}

				if (Date.now() - start > timeoutMs) {
					return {
						text: originalText,
						details: { ok: false, reason: "timeout", mode },
					};
				}

				await sleep(200);
			}

			const editedText = await readFile(textPath, "utf8");
			const exitRaw = await readFile(donePath, "utf8");
			const exitCode = Number.parseInt(exitRaw.trim(), 10);

			return {
				text: editedText,
				details: {
					ok: true,
					mode,
					changed: editedText !== originalText,
					exitCode: Number.isNaN(exitCode) ? null : exitCode,
					tempFile: cleanup ? undefined : textPath,
				},
			};
		}

		const editedViaUi = await ctx.ui.editor(`Edit ${purpose}`, originalText);
		const finalUiText = editedViaUi ?? originalText;
		return {
			text: finalUiText,
			details: {
				ok: true,
				mode: "ui-editor",
				changed: finalUiText !== originalText,
				cancelled: editedViaUi === undefined,
			},
		};
	} finally {
		if (cleanup) {
			await rm(tmpPath, { recursive: true, force: true });
		}
	}
}

export default function editProposedText(pi: ExtensionAPI) {
	pi.registerTool({
		name: "edit_proposed_text",
		label: "Edit Proposed Text",
		description:
			"Open proposed text in nvim for user edits. Uses a zellij floating pane when available, waits for editor exit, then returns edited text.",
		parameters: Type.Object({
			text: Type.String({ description: "The proposed text to edit" }),
			purpose: Type.Optional(Type.String({ description: "Short description of what the text is for" })),
			floating: Type.Optional(
				Type.Boolean({ description: "When running in zellij, open nvim in a floating pane (default: true)" }),
			),
			fileExtension: Type.Optional(Type.String({ description: "Temp file extension (default: md)" })),
			editorCommand: Type.Optional(
				Type.String({ description: "Editor command (default: $PI_EDIT_TEXT_EDITOR/$VISUAL/$EDITOR/nvim)" }),
			),
			timeoutSeconds: Type.Optional(Type.Number({ description: "Timeout waiting for editor exit (default: 1800)" })),
			cleanup: Type.Optional(Type.Boolean({ description: "Delete temp files after readback (default: true)" })),
		}),

		async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
			const result = await editText(pi, ctx, rawParams as Params, signal);

			if (!result.details.ok) {
				if (result.details.reason === "no-interactive-ui") {
					return {
						content: [{ type: "text", text: "Error: interactive text editing requires zellij or a UI session." }],
						details: result.details,
					};
				}

				if (result.details.reason === "zellij-launch-failed") {
					return {
						content: [
							{
								type: "text",
								text: `Error: failed to open editor via zellij (exit ${result.details.code ?? "?"}). stderr:\n${result.details.stderr || "(empty)"}`,
							},
						],
						details: result.details,
					};
				}

				if (result.details.reason === "timeout") {
					return {
						content: [{ type: "text", text: "Timed out waiting for editor to close." }],
						details: result.details,
					};
				}

				if (result.details.reason === "aborted") {
					return {
						content: [{ type: "text", text: "Editing cancelled." }],
						details: result.details,
					};
				}
			}

			return {
				content: [{ type: "text", text: result.text }],
				details: result.details,
			};
		},
	});

	pi.registerShortcut("ctrl+shift+e", {
		description: "Edit current input text in nvim (zellij floating pane)",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;

			const current = ctx.ui.getEditorText();
			const fallback = current.trim().length > 0 ? undefined : getLastAssistantText(ctx);
			const initialText = current.trim().length > 0 ? current : (fallback ?? current);
			const result = await editText(pi, ctx, {
				text: initialText,
				purpose: "current input",
				fileExtension: "md",
				floating: true,
				cleanup: true,
			});

			if (!result.details.ok) {
				if (result.details.reason === "timeout") {
					ctx.ui.notify("External editor timed out", "warning");
					return;
				}
				if (result.details.reason === "zellij-launch-failed") {
					ctx.ui.notify("Failed to launch zellij editor pane", "warning");
					return;
				}
				ctx.ui.notify("Could not open editor", "warning");
				return;
			}

			ctx.ui.setEditorText(result.text);
			if (result.details.changed) {
				ctx.ui.notify("Updated input from external editor", "info");
			} else if (fallback) {
				ctx.ui.notify("Loaded last assistant message in external editor", "info");
			} else {
				ctx.ui.notify("Editor closed (no text changes)", "info");
			}
		},
	});
}
