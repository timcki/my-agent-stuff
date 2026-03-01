/**
 * Slash command registration for /toolview.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ToolviewConfig, ToolviewPreset, ToolName } from "./types.js";
import { ALL_TOOL_NAMES } from "./types.js";
import { saveConfig, CONFIG_PATH } from "./config.js";

/**
 * Register the /toolview command with subcommands.
 */
export function registerCommands(pi: ExtensionAPI, config: ToolviewConfig): void {
	pi.registerCommand("toolview", {
		description: "Configure compact tool display (preset, tool on/off, raw, show)",
		handler: async (args, ctx) => {
			if (!args || args.trim() === "") {
				showHelp(ctx);
				return;
			}

			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0];

			switch (subcommand) {
				case "preset":
					handlePreset(parts.slice(1), config, ctx);
					break;
				case "tool":
					handleTool(parts.slice(1), config, ctx);
					break;
				case "raw":
					handleRaw(parts.slice(1), config, ctx);
					break;
				case "show":
					showConfig(config, ctx);
					break;
				default:
					ctx.ui.notify(`Unknown subcommand: ${subcommand}. Use: preset, tool, raw, show`, "error");
			}
		},
		getArgumentCompletions: (prefix: string) => {
			const items = [
				{ value: "preset regular", label: "preset regular" },
				{ value: "preset terse", label: "preset terse" },
				{ value: "show", label: "show" },
				{ value: "raw on", label: "raw on" },
				{ value: "raw off", label: "raw off" },
				...ALL_TOOL_NAMES.map((t) => ({ value: `tool ${t} on`, label: `tool ${t} on` })),
				...ALL_TOOL_NAMES.map((t) => ({ value: `tool ${t} off`, label: `tool ${t} off` })),
			];
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
	});
}

function showHelp(ctx: ExtensionContext): void {
	ctx.ui.notify(
		[
			"Usage: /toolview <subcommand>",
			"  preset terse|regular  — Switch collapse thresholds",
			"  tool <name> on|off    — Enable/disable a tool override",
			"  raw on|off            — Toggle raw output mode",
			"  show                  — Show current config",
			"",
			"Note: tool on/off changes require restart to take effect.",
		].join("\n"),
		"info",
	);
}

function handlePreset(args: string[], config: ToolviewConfig, ctx: ExtensionContext): void {
	const preset = args[0];
	if (preset !== "terse" && preset !== "regular") {
		ctx.ui.notify("Usage: /toolview preset terse|regular", "error");
		return;
	}
	config.preset = preset as ToolviewPreset;
	saveConfig(config);
	const t = config.thresholds[config.preset];
	ctx.ui.notify(`Preset changed to "${preset}" (maxLines=${t.maxLines}, maxChars=${t.maxChars}). Active immediately.`, "info");
}

function handleTool(args: string[], config: ToolviewConfig, ctx: ExtensionContext): void {
	if (args.length < 2) {
		ctx.ui.notify(`Usage: /toolview tool <name> on|off\nTools: ${ALL_TOOL_NAMES.join(", ")}`, "error");
		return;
	}
	const name = args[0] as ToolName;
	const toggle = args[1];
	if (!ALL_TOOL_NAMES.includes(name)) {
		ctx.ui.notify(`Unknown tool: ${name}. Available: ${ALL_TOOL_NAMES.join(", ")}`, "error");
		return;
	}
	if (toggle !== "on" && toggle !== "off") {
		ctx.ui.notify("Usage: /toolview tool <name> on|off", "error");
		return;
	}
	config.toolEnabled[name] = toggle === "on";
	saveConfig(config);
	ctx.ui.notify(`Tool "${name}" ${toggle === "on" ? "enabled" : "disabled"}. Restart required to take effect.`, "info");
}

function handleRaw(args: string[], config: ToolviewConfig, ctx: ExtensionContext): void {
	const toggle = args[0];
	if (toggle !== "on" && toggle !== "off") {
		ctx.ui.notify("Usage: /toolview raw on|off", "error");
		return;
	}
	config.rawViewEnabled = toggle === "on";
	saveConfig(config);
	ctx.ui.notify(`Raw view ${toggle === "on" ? "enabled" : "disabled"}. Active immediately.`, "info");
}

function showConfig(config: ToolviewConfig, ctx: ExtensionContext): void {
	const t = config.thresholds[config.preset];
	const enabledTools = ALL_TOOL_NAMES.filter((n) => config.toolEnabled[n]);
	const disabledTools = ALL_TOOL_NAMES.filter((n) => !config.toolEnabled[n]);

	const lines = [
		`ToolView Compact — Current Config`,
		`  Preset: ${config.preset} (maxLines=${t.maxLines}, maxChars=${t.maxChars})`,
		`  Preview: ${config.preview.headLines} head + ${config.preview.tailLines} tail lines`,
		`  Raw mode: ${config.rawViewEnabled ? "on" : "off"}`,
		`  Enabled: ${enabledTools.join(", ") || "none"}`,
		disabledTools.length ? `  Disabled: ${disabledTools.join(", ")}` : "",
		`  Config: ${CONFIG_PATH}`,
	]
		.filter(Boolean)
		.join("\n");

	ctx.ui.notify(lines, "info");
}
