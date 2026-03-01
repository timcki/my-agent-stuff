/**
 * frame.ts – Pure frame-wrapping logic for user message bubbles.
 *
 * Takes pre-rendered content lines and wraps them in a rounded border
 * with left indentation (right-aligned chat bubble effect).
 */

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const TOP_LEFT = "╭";
const TOP_RIGHT = "╮";
const BOTTOM_LEFT = "╰";
const BOTTOM_RIGHT = "╯";
const VERTICAL = "│";
const HORIZONTAL = "─";

/**
 * Wrap rendered content lines in a rounded frame with left indent.
 *
 * @param lines      - Content lines (may contain ANSI escapes)
 * @param fullWidth  - Total terminal width
 * @param indent     - Number of spaces to prepend (left indent)
 * @param colorFn    - Border coloring function (from theme thinking level)
 * @returns Framed lines including spacer
 */
export function wrapInFrame(
	lines: string[],
	fullWidth: number,
	indent: number,
	colorFn: (s: string) => string,
): string[] {
	// Separate leading empty/spacer lines from content
	let spacerEnd = 0;
	for (let i = 0; i < lines.length; i++) {
		if (visibleWidth(lines[i]!) === 0) {
			spacerEnd = i + 1;
		} else {
			break;
		}
	}

	const spacerLines = lines.slice(0, spacerEnd);
	const contentLines = lines.slice(spacerEnd);

	// Inner width = full width - indent - 2 border chars
	const innerWidth = fullWidth - indent - 2;
	if (innerWidth < 1) return lines; // safety: degenerate case

	const pad = " ".repeat(indent);
	const hBar = HORIZONTAL.repeat(innerWidth);

	const out: string[] = [];

	// Re-add spacer lines
	for (const s of spacerLines) out.push(s);

	// Top border
	out.push(pad + colorFn(TOP_LEFT + hBar + TOP_RIGHT));

	// Content lines
	if (contentLines.length === 0) {
		// Empty message: single empty row
		out.push(pad + colorFn(VERTICAL) + " ".repeat(innerWidth) + colorFn(VERTICAL));
	} else {
		for (const line of contentLines) {
			const vw = visibleWidth(line);
			let wrapped: string;
			if (vw <= innerWidth) {
				// Pad right to fill frame
				wrapped = line + " ".repeat(innerWidth - vw);
			} else {
				// Truncate to fit
				wrapped = truncateToWidth(line, innerWidth);
			}
			out.push(pad + colorFn(VERTICAL) + wrapped + colorFn(VERTICAL));
		}
	}

	// Bottom border
	out.push(pad + colorFn(BOTTOM_LEFT + hBar + BOTTOM_RIGHT));

	return out;
}
