/**
 * amp-frame.ts – Decorates the editor's rendered frame with rounded corners
 * and side borders (amp-style), without patching pi-amplike.
 *
 * Works by monkey-patching `ctx.ui.setEditorComponent` so every editor factory
 * (including the one from pi-amplike/modes) gets its `render()` output
 * transformed post-hoc.
 *
 * Approach: call the original render(width - 2) to get narrower output, then
 * wrap each line with frame characters (╭╮│╰╯). This avoids needing padding
 * spaces and works correctly for any number of content lines.
 *
 * Kill switch: set PI_AMP_FRAME=0 in environment to disable.
 *
 * Assumptions (checked defensively – falls back to unmodified output):
 *   - First line of render() output is a top border made of "─" characters
 *     (possibly with ANSI coloring and/or a scroll indicator / mode label).
 *   - Last non-autocomplete line is a bottom border of the same shape.
 *   - Content lines in between are padded text (no side borders).
 *   - Autocomplete lines (if any) follow the bottom border.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ── ANSI helpers ──────────────────────────────────────────────────────────────

/** Strip ANSI escape sequences to get visible text. */
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Visible (printable) width, ignoring ANSI escapes. */
const visWidth = (s: string): number => {
	let w = 0;
	const plain = stripAnsi(s);
	for (const _ of plain) w++;
	return w;
};

// ── Frame characters ──────────────────────────────────────────────────────────

const TOP_LEFT = "╭";
const TOP_RIGHT = "╮";
const BOTTOM_LEFT = "╰";
const BOTTOM_RIGHT = "╯";
const VERTICAL = "│";

// ── Border detection ──────────────────────────────────────────────────────────

/**
 * Heuristic: a line is a horizontal border if ≥40% of its visible chars are "─".
 * Generous enough for scroll indicators and mode labels.
 */
function isBorderLine(line: string): boolean {
	const plain = stripAnsi(line);
	if (plain.length === 0) return false;
	let dashes = 0;
	for (const ch of plain) {
		if (ch === "─") dashes++;
	}
	return dashes / plain.length >= 0.4;
}

// ── Core transform ───────────────────────────────────────────────────────────

/**
 * Transform lines rendered at innerWidth into a framed output at outerWidth.
 *
 * - Top border:    ╭ + border + ╮
 * - Content lines: │ + content + │  (content padded/trimmed to innerWidth)
 * - Bottom border: ╰ + border + ╯
 * - Autocomplete:  " " + line + " " (visual alignment below frame)
 *
 * Returns null if border detection fails → caller uses fallback.
 */
function transformFrame(
	lines: string[],
	innerWidth: number,
	colorFn: (s: string) => string,
): string[] | null {
	if (lines.length < 2) return null;

	// Top border = first line; must be a border.
	if (!isBorderLine(lines[0]!)) return null;

	// Bottom border = last border line; anything after is autocomplete.
	let bottomIdx = -1;
	for (let i = lines.length - 1; i > 0; i--) {
		if (isBorderLine(lines[i]!)) {
			bottomIdx = i;
			break;
		}
	}
	if (bottomIdx < 1) return null;

	const out: string[] = [];
	const left = colorFn(VERTICAL);
	const right = colorFn(VERTICAL);

	// Top border: ╭ ... ╮
	out.push(colorFn(TOP_LEFT) + lines[0] + colorFn(TOP_RIGHT));

	// Content lines: │ ... │
	for (let i = 1; i < bottomIdx; i++) {
		const line = lines[i]!;
		const vw = visWidth(line);

		if (vw === innerWidth) {
			// Exact width — just wrap.
			out.push(left + line + right);
		} else if (vw < innerWidth) {
			// Pad right to fill.
			out.push(left + line + " ".repeat(innerWidth - vw) + right);
		} else {
			// Wider than expected (cursor overflow edge case) — trim visible chars
			// from the right. Walk backwards to find the trim point.
			// Safe fallback: just wrap as-is (may be 1 char too wide, but avoids
			// breaking ANSI/cursor sequences).
			out.push(left + line + right);
		}
	}

	// Bottom border: ╰ ... ╯
	out.push(colorFn(BOTTOM_LEFT) + lines[bottomIdx] + colorFn(BOTTOM_RIGHT));

	// Autocomplete lines: indent to align with content inside frame.
	for (let i = bottomIdx + 1; i < lines.length; i++) {
		out.push(" " + lines[i]! + " ");
	}

	return out;
}

// ── Extension entry point ────────────────────────────────────────────────────

/** Symbol used to mark that we've already patched setEditorComponent. */
const PATCHED = Symbol.for("amp-frame-patched");

/** Minimum outer width to apply framing. Below this, skip decoration. */
const MIN_FRAME_WIDTH = 6;

export default function ampFrame(pi: ExtensionAPI) {
	// Kill switch
	if (process.env.PI_AMP_FRAME === "0") return;

	function patchSetEditorComponent(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		const ui = ctx.ui as any;
		if (ui[PATCHED]) return;
		ui[PATCHED] = true;

		const originalSetEditor: typeof ctx.ui.setEditorComponent =
			ctx.ui.setEditorComponent.bind(ctx.ui);

		ctx.ui.setEditorComponent = (factory) => {
			if (!factory) {
				originalSetEditor(undefined);
				return;
			}

			const wrappedFactory: typeof factory = (tui, theme, keybindings) => {
				const editor = factory(tui, theme, keybindings);
				const originalRender = editor.render.bind(editor);

				editor.render = (width: number): string[] => {
					// Too narrow for frame — render normally.
					if (width < MIN_FRAME_WIDTH) return originalRender(width);

					const innerWidth = width - 2;
					const lines = originalRender(innerWidth);

					try {
						const colorFn: (s: string) => string =
							typeof editor.borderColor === "function"
								? editor.borderColor
								: (s: string) => s;

						const framed = transformFrame(lines, innerWidth, colorFn);
						if (framed) return framed;
					} catch {
						// Fall through to fallback.
					}

					// Fallback: re-render at full width, undecorated.
					return originalRender(width);
				};

				return editor;
			};

			originalSetEditor(wrappedFactory);
		};
	}

	pi.on("session_start", (_event, ctx) => {
		patchSetEditorComponent(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		patchSetEditorComponent(ctx);
	});
}
