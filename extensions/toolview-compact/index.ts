/**
 * ToolView Compact — Compact, safe rendering for built-in tool output.
 *
 * Replaces built-in tools (read, bash, edit, write, find, grep, ls) with
 * compact-rendering overrides that collapse long output, sanitize unsafe
 * escape sequences (OSC, ANSI, control chars), and provide expandable views.
 *
 * Configure via /toolview command or ~/.pi/tool-display-compact.json
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import { registerToolOverrides } from "./tools.js";

export default function (pi: ExtensionAPI) {
	const config = loadConfig();

	// Register /toolview commands
	registerCommands(pi, config);

	// Register tool overrides on session start (need cwd)
	pi.on("session_start", async (_event, ctx) => {
		registerToolOverrides(pi, config, ctx.cwd);
	});
}
