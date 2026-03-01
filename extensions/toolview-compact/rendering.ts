/**
 * Shared rendering primitives for compact tool display.
 */

import type { ThresholdConfig, PreviewConfig } from "./types.js";
import { sanitizeForDisplay } from "./sanitize.js";

export interface CollapseDecision {
	shouldCollapse: boolean;
	lineCount: number;
	charCount: number;
}

/**
 * Determine if output should be collapsed based on thresholds.
 */
export function shouldCollapse(text: string, thresholds: ThresholdConfig): CollapseDecision {
	const lineCount = text.split("\n").length;
	const charCount = text.length;
	return {
		shouldCollapse: lineCount > thresholds.maxLines || charCount > thresholds.maxChars,
		lineCount,
		charCount,
	};
}

export interface PreviewResult {
	previewLines: string[];
	hiddenCount: number;
	totalLines: number;
}

/**
 * Build a preview from head + tail lines.
 */
export function buildPreview(text: string, preview: PreviewConfig): PreviewResult {
	const lines = text.split("\n");
	const totalLines = lines.length;
	const { headLines, tailLines } = preview;
	const totalPreview = headLines + tailLines;

	if (totalLines <= totalPreview) {
		return { previewLines: lines, hiddenCount: 0, totalLines };
	}

	const head = lines.slice(0, headLines);
	const tail = lines.slice(-tailLines);
	const hiddenCount = totalLines - totalPreview;

	return { previewLines: [...head, `  ... +${hiddenCount} lines hidden ...`, ...tail], hiddenCount, totalLines };
}

/**
 * Truncate a single line to maxWidth with ellipsis.
 */
export function truncateLine(line: string, maxWidth: number): string {
	if (line.length <= maxWidth) return line;
	if (maxWidth <= 3) return line.slice(0, maxWidth);
	return line.slice(0, maxWidth - 3) + "...";
}

export interface RenderBlockOptions {
	summary: string;
	output?: string;
	isError?: boolean;
	expanded?: boolean;
	rawMode?: boolean;
	rawOutput?: string;
	thresholds: ThresholdConfig;
	preview: PreviewConfig;
	expandHint?: string;
	/** Optional function to colorize each output line after preview/collapse. */
	colorizeLine?: (line: string) => string;
}

/**
 * Render a compact tool output block.
 * Returns the full text string to be used in a Text component.
 */
export function renderCompactBlock(opts: RenderBlockOptions): string {
	const { summary, output, isError, expanded, rawMode, rawOutput, thresholds, preview, expandHint, colorizeLine } = opts;
	const parts: string[] = [summary];

	if (!output && !isError) {
		return parts.join("\n");
	}

	const displayText = output ?? "";
	const sanitized = sanitizeForDisplay(displayText);
	const collapse = shouldCollapse(sanitized, thresholds);

	const colorize = (text: string) => {
		if (!colorizeLine) return text;
		return text.split("\n").map(colorizeLine).join("\n");
	};

	if (expanded) {
		if (rawMode && rawOutput) {
			parts.push("");
			parts.push("── RAW OUTPUT ──");
			parts.push(rawOutput);
		} else {
			parts.push("");
			parts.push(colorize(sanitized));
		}
	} else if (collapse.shouldCollapse) {
		const prev = buildPreview(sanitized, preview);
		parts.push("");
		for (const line of prev.previewLines) {
			const truncated = truncateLine(line, 200);
			parts.push(colorizeLine ? colorizeLine(truncated) : truncated);
		}
		if (expandHint) {
			parts.push("");
			parts.push(expandHint);
		}
	} else {
		// Short enough to show in full
		parts.push("");
		parts.push(colorize(sanitized));
	}

	return parts.join("\n");
}

/**
 * Colorize unified diff output line-by-line using theme colors.
 */
export function colorizeDiff(diff: string, theme: any): string {
	return diff
		.split("\n")
		.map((line) => {
			if (line.startsWith("+++") || line.startsWith("---")) {
				return theme.fg("dim" as any, line);
			}
			if (line.startsWith("+")) {
				return theme.fg("success" as any, line);
			}
			if (line.startsWith("-")) {
				return theme.fg("error" as any, line);
			}
			if (line.startsWith("@@")) {
				return theme.fg("accent" as any, line);
			}
			return line;
		})
		.join("\n");
}

/**
 * Format a file size in bytes to human-readable.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Detect file type from extension.
 */
export function detectFileType(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	const typeMap: Record<string, string> = {
		ts: "TypeScript",
		tsx: "TypeScript/JSX",
		js: "JavaScript",
		jsx: "JavaScript/JSX",
		py: "Python",
		rs: "Rust",
		go: "Go",
		rb: "Ruby",
		java: "Java",
		c: "C",
		cpp: "C++",
		h: "C Header",
		hpp: "C++ Header",
		css: "CSS",
		html: "HTML",
		json: "JSON",
		yaml: "YAML",
		yml: "YAML",
		toml: "TOML",
		md: "Markdown",
		sh: "Shell",
		bash: "Bash",
		zsh: "Zsh",
		sql: "SQL",
		xml: "XML",
		svg: "SVG",
		png: "Image",
		jpg: "Image",
		jpeg: "Image",
		gif: "Image",
		webp: "Image",
	};
	return typeMap[ext] ?? "text";
}
