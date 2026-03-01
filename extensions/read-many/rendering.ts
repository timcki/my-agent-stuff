/**
 * Rendering utilities for read-many extension.
 * Subset copied from toolview-compact for zero-coupling independence.
 */

import { keyHint } from "@mariozechner/pi-coding-agent";

// ── Sanitization ──

function stripOsc(text: string): string {
	return text.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "");
}

function stripAnsiSgr(text: string): string {
	return text.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "");
}

function stripControlChars(text: string): string {
	return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

export function sanitizeForDisplay(text: string): string {
	return stripControlChars(stripAnsiSgr(stripOsc(text)));
}

// ── Formatting ──

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Compact block rendering ──

interface ThresholdConfig {
	maxLines: number;
	maxChars: number;
}

interface PreviewConfig {
	headLines: number;
	tailLines: number;
}

const DEFAULT_THRESHOLDS: ThresholdConfig = { maxLines: 20, maxChars: 2000 };
const DEFAULT_PREVIEW: PreviewConfig = { headLines: 4, tailLines: 3 };

function shouldCollapse(text: string, thresholds: ThresholdConfig): boolean {
	const lineCount = text.split("\n").length;
	return lineCount > thresholds.maxLines || text.length > thresholds.maxChars;
}

function buildPreview(text: string, preview: PreviewConfig): string[] {
	const lines = text.split("\n");
	const total = lines.length;
	const needed = preview.headLines + preview.tailLines;
	if (total <= needed) return lines;

	const head = lines.slice(0, preview.headLines);
	const tail = lines.slice(-preview.tailLines);
	const hidden = total - needed;
	return [...head, `  ... +${hidden} lines hidden ...`, ...tail];
}

function truncateLine(line: string, maxWidth: number): string {
	if (line.length <= maxWidth) return line;
	if (maxWidth <= 3) return line.slice(0, maxWidth);
	return line.slice(0, maxWidth - 3) + "...";
}

export function makeExpandHint(): string {
	return `  ${keyHint("expandTools", "to expand")}`;
}

export interface RenderBlockOptions {
	summary: string;
	output?: string;
	isError?: boolean;
	expanded?: boolean;
	thresholds?: ThresholdConfig;
	preview?: PreviewConfig;
	expandHint?: string;
}

export function renderCompactBlock(opts: RenderBlockOptions): string {
	const {
		summary,
		output,
		isError,
		expanded,
		thresholds = DEFAULT_THRESHOLDS,
		preview = DEFAULT_PREVIEW,
		expandHint,
	} = opts;
	const parts: string[] = [summary];

	if (!output && !isError) return parts.join("\n");

	const sanitized = sanitizeForDisplay(output ?? "");

	if (expanded) {
		parts.push("");
		parts.push(sanitized);
	} else if (shouldCollapse(sanitized, thresholds)) {
		const prev = buildPreview(sanitized, preview);
		parts.push("");
		for (const line of prev) {
			parts.push(truncateLine(line, 200));
		}
		if (expandHint) {
			parts.push("");
			parts.push(expandHint);
		}
	} else {
		parts.push("");
		parts.push(sanitized);
	}

	return parts.join("\n");
}
