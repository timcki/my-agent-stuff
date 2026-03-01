/**
 * Per-tool summary text generation.
 */

import { sanitizeForDisplay } from "./sanitize.js";
import { formatBytes, detectFileType } from "./rendering.js";

/**
 * Summarize a read tool call result (metrics only, no tool name/path/status icon).
 */
export function summarizeRead(args: { path: string; offset?: number; limit?: number }, content: string, isError: boolean): string {
	if (isError) return "error";
	const lines = content.split("\n");
	const bytes = Buffer.byteLength(content, "utf-8");
	const fileType = detectFileType(args.path);
	return `${fileType}, ${lines.length} lines, ${formatBytes(bytes)}`;
}

/**
 * Summarize a bash tool call result (metrics only, no tool name/command/status icon).
 */
export function summarizeBash(
	args: { command: string; timeout?: number },
	content: string,
	isError: boolean,
	durationMs?: number,
): string {
	const sanitized = sanitizeForDisplay(content);
	const lines = sanitized.split("\n");
	const lineCount = lines.length;

	const meta: string[] = [];
	if (durationMs !== undefined) {
		if (durationMs < 1000) meta.push(`${durationMs}ms`);
		else meta.push(`${(durationMs / 1000).toFixed(1)}s`);
	}
	meta.push(`${lineCount} lines`);
	return meta.join(", ");
}

/**
 * Summarize an edit tool call result (metrics only, no tool name/path/status icon).
 */
export function summarizeEdit(
	args: { path: string; oldText: string; newText: string },
	diff: string | undefined,
	isError: boolean,
): string {
	if (isError) return "error";

	let additions = 0;
	let removals = 0;
	if (diff) {
		for (const line of diff.split("\n")) {
			if (line.startsWith("+") && !line.startsWith("+++")) additions++;
			if (line.startsWith("-") && !line.startsWith("---")) removals++;
		}
	}
	return `+${additions}/-${removals} lines`;
}

/**
 * Summarize a write tool call result (metrics only, no tool name/path/status icon).
 */
export function summarizeWrite(args: { path: string; content: string }, isError: boolean): string {
	if (isError) return "error";
	const lines = args.content.split("\n").length;
	const bytes = Buffer.byteLength(args.content, "utf-8");
	return `${lines} lines, ${formatBytes(bytes)}`;
}

/**
 * Summarize a find tool call result (metrics only, no tool name/pattern/status icon).
 */
export function summarizeFind(
	args: { pattern: string; path?: string; limit?: number },
	content: string,
	isError: boolean,
	details?: { resultLimitReached?: number },
): string {
	if (isError) return "error";
	const sanitized = sanitizeForDisplay(content);
	const results = sanitized.trim() ? sanitized.trim().split("\n").length : 0;
	let summary = `${results} results`;
	if (details?.resultLimitReached) summary += ` (limit: ${details.resultLimitReached})`;
	return summary;
}

/**
 * Summarize a grep tool call result (metrics only, no tool name/pattern/status icon).
 */
export function summarizeGrep(
	args: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; literal?: boolean; context?: number; limit?: number },
	content: string,
	isError: boolean,
	details?: { matchLimitReached?: number },
): string {
	if (isError) return "error";
	const sanitized = sanitizeForDisplay(content);
	const matches = sanitized.trim() ? sanitized.trim().split("\n").length : 0;
	let summary = `${matches} matches`;
	if (details?.matchLimitReached) summary += ` (limit reached: ${details.matchLimitReached})`;
	return summary;
}

/**
 * Summarize an ls tool call result (metrics only, no tool name/path/status icon).
 */
export function summarizeLs(
	args: { path?: string; limit?: number },
	content: string,
	isError: boolean,
	details?: { entryLimitReached?: number },
): string {
	if (isError) return "error";
	const sanitized = sanitizeForDisplay(content);
	const entries = sanitized.trim() ? sanitized.trim().split("\n").length : 0;
	let summary = `${entries} entries`;
	if (details?.entryLimitReached) summary += ` (limit: ${details.entryLimitReached})`;
	return summary;
}
