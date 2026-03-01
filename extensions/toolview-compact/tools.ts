/**
 * Tool override wiring.
 *
 * Creates compact-rendering overrides for all 7 built-in tools.
 * Delegates execute() to the original built-in implementations.
 * Provides custom renderCall() and renderResult() for compact display.
 *
 * Uses closure state to pass args from renderCall to renderResult,
 * since renderResult only receives the result object.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createReadTool,
	createBashTool,
	createEditTool,
	createWriteTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	keyHint,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import type { ToolviewConfig, ToolName } from "./types.js";
import { renderCompactBlock } from "./rendering.js";
import {
	summarizeRead,
	summarizeBash,
	summarizeEdit,
	summarizeWrite,
	summarizeFind,
	summarizeGrep,
	summarizeLs,
} from "./summaries.js";

function getTextContent(content: Array<{ type: string; text?: string }>): string {
	return content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => c.text!)
		.join("\n");
}

function getThresholds(config: ToolviewConfig) {
	return config.thresholds[config.preset];
}

function makeExpandHint(): string {
	return `  ${keyHint("expandTools", "to expand")}`;
}

/**
 * Build a colored status icon.
 */
function statusIcon(theme: any, isError: boolean): string {
	return isError
		? theme.fg("error" as any, "✗")
		: theme.fg("success" as any, "✓");
}

/**
 * Register all enabled tool overrides.
 */
export function registerToolOverrides(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const toolFactories: Record<ToolName, () => void> = {
		read: () => registerReadOverride(pi, config, cwd),
		bash: () => registerBashOverride(pi, config, cwd),
		edit: () => registerEditOverride(pi, config, cwd),
		write: () => registerWriteOverride(pi, config, cwd),
		find: () => registerFindOverride(pi, config, cwd),
		grep: () => registerGrepOverride(pi, config, cwd),
		ls: () => registerLsOverride(pi, config, cwd),
	};

	for (const [name, factory] of Object.entries(toolFactories)) {
		if (config.toolEnabled[name as ToolName]) {
			factory();
		}
	}
}

function registerReadOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createReadTool(cwd);
	let lastArgs: { path: string; offset?: number; limit?: number } = { path: "" };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "read",
		label: "Read",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return original.execute(toolCallId, params, signal, onUpdate, ctx as any);
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("read "));
			text += theme.fg("muted" as any, args.path);
			if (args.offset || args.limit) {
				const parts: string[] = [];
				if (args.offset) parts.push(`offset=${args.offset}`);
				if (args.limit) parts.push(`limit=${args.limit}`);
				text += theme.fg("dim" as any, ` (${parts.join(", ")})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Reading..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.startsWith("Error") || content.startsWith("Access denied");
			lastStatus = { isError };

			const metrics = summarizeRead(lastArgs, content, isError);
			const summary = `↳ ${metrics}`;
			const block = renderCompactBlock({
				summary,
				output: content,
				isError,
				expanded,
				rawMode: config.rawViewEnabled,
				rawOutput: config.rawViewEnabled ? content : undefined,
				thresholds: getThresholds(config),
				preview: config.preview,
				expandHint: makeExpandHint(),
			});
			return new Text(block, 0, 0);
		},
	});
}

function registerBashOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createBashTool(cwd);
	let lastArgs: { command: string; timeout?: number } = { command: "" };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "bash",
		label: "Bash",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const start = Date.now();
			const result = await original.execute(toolCallId, params, signal, onUpdate, ctx as any);
			const durationMs = Date.now() - start;
			if (result.details) {
				(result.details as any)._durationMs = durationMs;
			} else {
				(result as any).details = { _durationMs: durationMs };
			}
			return result;
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("bash "));
			const cmdPreview = args.command.length > 80 ? args.command.slice(0, 77) + "..." : args.command;
			text += theme.fg("dim" as any, `$ ${cmdPreview}`);
			if (args.timeout) text += theme.fg("muted" as any, ` (timeout=${args.timeout}s)`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Running..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.includes("exit code") && !content.includes("exit code 0");
			lastStatus = { isError };
			const durationMs = (result.details as any)?._durationMs;

			const metrics = summarizeBash(lastArgs, content, isError, durationMs);
			const summary = `↳ ${metrics}`;
			const block = renderCompactBlock({
				summary,
				output: content,
				isError,
				expanded,
				rawMode: config.rawViewEnabled,
				rawOutput: config.rawViewEnabled ? content : undefined,
				thresholds: getThresholds(config),
				preview: config.preview,
				expandHint: makeExpandHint(),
			});
			return new Text(block, 0, 0);
		},
	});
}

function registerEditOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createEditTool(cwd);
	let lastArgs: { path: string; oldText: string; newText: string } = { path: "", oldText: "", newText: "" };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "edit",
		label: "Edit",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return original.execute(toolCallId, params, signal, onUpdate, ctx as any);
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("edit "));
			text += theme.fg("muted" as any, args.path);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Editing..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.toLowerCase().includes("error");
			lastStatus = { isError };
			const diff = result.details?.diff as string | undefined;

			const metrics = summarizeEdit(lastArgs, diff, isError);
			const summary = `↳ ${metrics}`;
			const displayOutput = diff || content;
			const diffColorize = diff
				? (line: string) => {
						if (line.startsWith("+++") || line.startsWith("---")) return theme.fg("dim" as any, line);
						if (line.startsWith("+")) return theme.fg("success" as any, line);
						if (line.startsWith("-")) return theme.fg("error" as any, line);
						if (line.startsWith("@@")) return theme.fg("accent" as any, line);
						return line;
					}
				: undefined;
			const block = renderCompactBlock({
				summary,
				output: displayOutput,
				isError,
				expanded,
				rawMode: config.rawViewEnabled,
				rawOutput: config.rawViewEnabled ? displayOutput : undefined,
				thresholds: getThresholds(config),
				preview: config.preview,
				expandHint: makeExpandHint(),
				colorizeLine: diffColorize,
			});
			return new Text(block, 0, 0);
		},
	});
}

function registerWriteOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createWriteTool(cwd);
	let lastArgs: { path: string; content: string } = { path: "", content: "" };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "write",
		label: "Write",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return original.execute(toolCallId, params, signal, onUpdate, ctx as any);
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("write "));
			text += theme.fg("muted" as any, args.path);
			const lines = args.content.split("\n").length;
			const bytes = Buffer.byteLength(args.content, "utf-8");
			text += theme.fg("dim" as any, ` (${lines} lines, ${bytes}B)`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Writing..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.toLowerCase().includes("error");
			lastStatus = { isError };

			// On error, show the error message; on success, the call line already has all info
			if (isError) {
				return new Text(`↳ ${content}`, 0, 0);
			}
			return new Text("", 0, 0);
		},
	});
}

function registerFindOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createFindTool(cwd);
	let lastArgs: { pattern: string; path?: string; limit?: number } = { pattern: "" };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "find",
		label: "Find",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return original.execute(toolCallId, params, signal, onUpdate, ctx as any);
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("find "));
			text += theme.fg("muted" as any, `"${args.pattern}"`);
			if (args.path) text += theme.fg("dim" as any, ` in ${args.path}`);
			if (args.limit) text += theme.fg("dim" as any, ` (limit=${args.limit})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Finding..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.toLowerCase().includes("error");
			lastStatus = { isError };
			const details = result.details as any;

			const metrics = summarizeFind(lastArgs, content, isError, details);
			const summary = `↳ ${metrics}`;
			const block = renderCompactBlock({
				summary,
				output: content,
				isError,
				expanded,
				rawMode: config.rawViewEnabled,
				rawOutput: config.rawViewEnabled ? content : undefined,
				thresholds: getThresholds(config),
				preview: config.preview,
				expandHint: makeExpandHint(),
			});
			return new Text(block, 0, 0);
		},
	});
}

function registerGrepOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createGrepTool(cwd);
	let lastArgs: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; literal?: boolean; context?: number; limit?: number } = { pattern: "" };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "grep",
		label: "Grep",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return original.execute(toolCallId, params, signal, onUpdate, ctx as any);
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("grep "));
			text += theme.fg("muted" as any, `"${args.pattern}"`);
			if (args.path) text += theme.fg("dim" as any, ` in ${args.path}`);
			if (args.glob) text += theme.fg("dim" as any, ` glob=${args.glob}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Searching..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.toLowerCase().includes("error");
			lastStatus = { isError };
			const details = result.details as any;

			const metrics = summarizeGrep(lastArgs, content, isError, details);
			const summary = `↳ ${metrics}`;
			const block = renderCompactBlock({
				summary,
				output: content,
				isError,
				expanded,
				rawMode: config.rawViewEnabled,
				rawOutput: config.rawViewEnabled ? content : undefined,
				thresholds: getThresholds(config),
				preview: config.preview,
				expandHint: makeExpandHint(),
			});
			return new Text(block, 0, 0);
		},
	});
}

function registerLsOverride(pi: ExtensionAPI, config: ToolviewConfig, cwd: string): void {
	const original = createLsTool(cwd);
	let lastArgs: { path?: string; limit?: number } = {};
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "ls",
		label: "Ls",
		description: original.description,
		parameters: original.parameters,

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			return original.execute(toolCallId, params, signal, onUpdate, ctx as any);
		},

		renderCall(args, theme) {
			lastArgs = args;
			let text = "";
			if (lastStatus) text += statusIcon(theme, lastStatus.isError) + " ";
			text += theme.fg("toolTitle" as any, theme.bold("ls "));
			text += theme.fg("muted" as any, args.path ?? ".");
			if (args.limit) text += theme.fg("dim" as any, ` (limit=${args.limit})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("dim" as any, "Listing..."), 0, 0);

			const content = getTextContent(result.content);
			const isError = content.toLowerCase().includes("error");
			lastStatus = { isError };
			const details = result.details as any;

			const metrics = summarizeLs(lastArgs, content, isError, details);
			const summary = `↳ ${metrics}`;
			const block = renderCompactBlock({
				summary,
				output: content,
				isError,
				expanded,
				rawMode: config.rawViewEnabled,
				rawOutput: config.rawViewEnabled ? content : undefined,
				thresholds: getThresholds(config),
				preview: config.preview,
				expandHint: makeExpandHint(),
			});
			return new Text(block, 0, 0);
		},
	});
}
