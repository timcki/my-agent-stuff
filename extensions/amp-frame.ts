/**
 * amp-frame.ts – Decorates the editor's rendered frame with rounded corners
 * and side borders (amp-style). Also provides a compact single-line footer
 * showing path, jj/git revision, context usage, and model info.
 *
 * Extension statuses (like "YOLO mode") are integrated right-aligned into the
 * frame's bottom border instead of appearing as separate footer lines.
 *
 * Kill switch: set PI_AMP_FRAME=0 in environment to disable.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import os from "node:os";

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

const visWidth = (s: string): number => {
	let w = 0;
	for (const _ of stripAnsi(s)) w++;
	return w;
};

// ── Frame characters ──────────────────────────────────────────────────────────

const TOP_LEFT = "╭";
const TOP_RIGHT = "╮";
const BOTTOM_LEFT = "╰";
const BOTTOM_RIGHT = "╯";
const VERTICAL = "│";

// ── Border detection ──────────────────────────────────────────────────────────

function isBorderLine(line: string): boolean {
	const plain = stripAnsi(line);
	if (plain.length === 0) return false;
	let dashes = 0;
	for (const ch of plain) {
		if (ch === "─") dashes++;
	}
	return dashes / plain.length >= 0.4;
}

// ── Shared state ──────────────────────────────────────────────────────────────

/** Latest extension context (updated on session_start/switch). */
let currentCtx: ExtensionContext | undefined;

/** Footer data provider reference (set when custom footer is installed). */
let footerDataRef: any = undefined;

/** Cached jj revision (id + description separately for coloring). */
let cachedJjId: string | null | undefined = undefined;
let cachedJjDesc: string | null = null;
let cachedJjTime = 0;
const JJ_CACHE_TTL = 5000;

function refreshJjRevision(cwd: string): void {
	const now = Date.now();
	if (cachedJjId !== undefined && now - cachedJjTime < JJ_CACHE_TTL) return;
	try {
		const rev = execSync("jj log --no-graph --ignore-working-copy -r @ -T 'change_id.shortest(4)'", {
			cwd,
			encoding: "utf8",
			timeout: 2000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
		if (!rev) {
			cachedJjId = null;
			cachedJjDesc = null;
		} else {
			cachedJjId = rev;
			const desc = execSync("jj log --no-graph --ignore-working-copy -r @ -T 'description.first_line()'", {
				cwd,
				encoding: "utf8",
				timeout: 2000,
				stdio: ["pipe", "pipe", "pipe"],
			}).trim();
			const MAX_DESC = 24;
			cachedJjDesc = desc
				? desc.length > MAX_DESC ? desc.slice(0, MAX_DESC) + "…" : desc
				: null;
		}
	} catch {
		cachedJjId = null;
		cachedJjDesc = null;
	}
	cachedJjTime = now;
}

/** Collect all extension status texts into a single string. */
function getExtensionStatusLabel(): string | null {
	if (!footerDataRef) return null;
	try {
		const statuses: ReadonlyMap<string, string> = footerDataRef.getExtensionStatuses();
		if (!statuses || statuses.size === 0) return null;
		return [...statuses.values()].join(" · ");
	} catch {
		return null;
	}
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 100_000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

// ── Context bar gradient ──────────────────────────────────────────────────────

type RGB = [number, number, number];

/** Color stops matching the theme's base16-tomorrow-night palette. */
const GRADIENT_STOPS: Array<{ pct: number; color: RGB }> = [
	{ pct: 0, color: [181, 189, 104] },   // green  (#b5bd68)
	{ pct: 20, color: [181, 189, 104] },   // green  (hold)
	{ pct: 35, color: [240, 198, 116] },   // yellow (#f0c674)
	{ pct: 55, color: [222, 147, 95] },    // orange (#de935f)
	{ pct: 100, color: [204, 102, 102] },  // red    (#cc6666)
];

function lerpColor(pct: number): RGB {
	for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
		const a = GRADIENT_STOPS[i]!;
		const b = GRADIENT_STOPS[i + 1]!;
		if (pct >= a.pct && pct <= b.pct) {
			const t = b.pct === a.pct ? 0 : (pct - a.pct) / (b.pct - a.pct);
			return [
				Math.round(a.color[0] + t * (b.color[0] - a.color[0])),
				Math.round(a.color[1] + t * (b.color[1] - a.color[1])),
				Math.round(a.color[2] + t * (b.color[2] - a.color[2])),
			];
		}
	}
	return GRADIENT_STOPS[GRADIENT_STOPS.length - 1]!.color;
}

function fgRgb(r: number, g: number, b: number, text: string): string {
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

// ── Core frame transform ─────────────────────────────────────────────────────

/**
 * Transform editor lines rendered at `innerWidth` into a framed output.
 *
 * - Top border:    ╭ + border + ╮
 * - Content lines: │ + content + │
 * - Bottom border: ╰ + border (with optional right-aligned label) + ╯
 * - Autocomplete:  indented below frame
 *
 * Returns null if border detection fails → caller uses fallback.
 */
function transformFrame(
	lines: string[],
	innerWidth: number,
	colorFn: (s: string) => string,
	bottomLabel?: { text: string; colorFn: (s: string) => string } | null,
): string[] | null {
	if (lines.length < 2) return null;
	if (!isBorderLine(lines[0]!)) return null;

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
			out.push(left + line + right);
		} else if (vw < innerWidth) {
			out.push(left + line + " ".repeat(innerWidth - vw) + right);
		} else {
			out.push(left + line + right);
		}
	}

	// Bottom border: ╰ ... ╯ (with optional right-aligned status label)
	if (bottomLabel?.text) {
		const labelChunk = ` ${bottomLabel.text} `;
		const labelVisWidth = labelChunk.length;
		const trailingDash = 1;
		const leftDashes = innerWidth - labelVisWidth - trailingDash;

		if (leftDashes >= 4) {
			const bottom =
				colorFn("─".repeat(leftDashes)) +
				bottomLabel.colorFn(labelChunk) +
				colorFn("─");
			out.push(colorFn(BOTTOM_LEFT) + bottom + colorFn(BOTTOM_RIGHT));
		} else {
			// Not enough room for label — plain border
			out.push(colorFn(BOTTOM_LEFT) + lines[bottomIdx] + colorFn(BOTTOM_RIGHT));
		}
	} else {
		out.push(colorFn(BOTTOM_LEFT) + lines[bottomIdx] + colorFn(BOTTOM_RIGHT));
	}

	// Autocomplete lines: indent to align with content inside frame
	for (let i = bottomIdx + 1; i < lines.length; i++) {
		out.push(" " + lines[i]! + " ");
	}

	return out;
}

// ── Custom single-line footer ────────────────────────────────────────────────

function setupFooter(pi: ExtensionAPI, ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;

	ctx.ui.setFooter((tui, theme, footerData) => {
		footerDataRef = footerData;
		const unsub = footerData.onBranchChange(() => {
			cachedJjTime = 0; // invalidate jj cache
			tui.requestRender();
		});

		return {
			dispose: unsub,
			invalidate() {},
			render(width: number): string[] {
				// ── Left: path · revision ──
				const homedir = os.homedir();
				let cwd = ctx.cwd;
				if (cwd.startsWith(homedir)) cwd = "~" + cwd.slice(homedir.length);

				refreshJjRevision(ctx.cwd);
				const gitBranch = footerData.getGitBranch();

				const sep = theme.fg("dim" as any, " · ");
				const leftParts: string[] = [theme.fg("muted" as any, cwd)];
				if (cachedJjId) {
					const descPart = cachedJjDesc
						? " " + theme.fg("dim" as any, cachedJjDesc)
						: "";
					leftParts.push(theme.fg("accent" as any, cachedJjId) + descPart);
				} else if (gitBranch) {
					leftParts.push(theme.fg("accent" as any, gitBranch));
				}
				const left = leftParts.join(sep);

				// ── Right: context bar + model ──
				const rightParts: string[] = [];

				// Context usage: gradient bar + window size
				const usage = ctx.getContextUsage?.();
				if (usage) {
					const pct = usage.percent ?? 0;
					const barLen = 10;
					const filled = Math.round((Math.min(pct, 100) / 100) * barLen);
					let bar = "";
					for (let i = 0; i < barLen; i++) {
						if (i < filled) {
							const segPct = ((i + 0.5) / barLen) * 100;
							const [r, g, b] = lerpColor(segPct);
							bar += fgRgb(r, g, b, "━");
						} else {
							bar += theme.fg("dim" as any, "─");
						}
					}
					const total = fmtTokens(usage.contextWindow);
					rightParts.push(
						bar + theme.fg("dim" as any, ` ${total}`),
					);
				}

				// Model + thinking level
				const model = ctx.model;
				if (model) {
					const thinkingLevel = pi.getThinkingLevel();
					const thinkingStr =
						thinkingLevel && thinkingLevel !== "off"
							? theme.fg("dim" as any, ` · ${thinkingLevel}`)
							: "";
					rightParts.push(
						theme.fg("muted" as any, model.id) + thinkingStr,
					);
				}

				const right = rightParts.join(sep);

				const leftW = visibleWidth(left);
				const rightW = visibleWidth(right);
				const pad = " ".repeat(Math.max(1, width - leftW - rightW));

				return [truncateToWidth(left + pad + right, width)];
			},
		};
	});
}

// ── Extension entry point ────────────────────────────────────────────────────

/** Symbol used to mark that we've already patched setEditorComponent. */
const PATCHED = Symbol.for("amp-frame-patched");

/** Minimum outer width to apply framing. */
const MIN_FRAME_WIDTH = 6;

export default function ampFrame(pi: ExtensionAPI) {
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
					if (width < MIN_FRAME_WIDTH) return originalRender(width);

					const innerWidth = width - 2;
					const lines = originalRender(innerWidth);

					try {
						const colorFn: (s: string) => string =
							typeof editor.borderColor === "function"
								? editor.borderColor
								: (s: string) => s;

						// Build bottom-border label from extension statuses
						const statusText = getExtensionStatusLabel();
						const bottomLabel = statusText
							? {
									text: statusText,
									colorFn: (s: string) => {
										try {
											return currentCtx!.ui.theme.fg(
												"frameLabel" as any,
												s,
											);
										} catch {
											return s;
										}
									},
								}
							: null;

						const framed = transformFrame(
							lines,
							innerWidth,
							colorFn,
							bottomLabel,
						);
						if (framed) return framed;
					} catch {
						// Fall through to fallback
					}

					return originalRender(width);
				};

				return editor;
			};

			originalSetEditor(wrappedFactory);
		};
	}

	function setup(_event: any, ctx: ExtensionContext) {
		currentCtx = ctx;
		patchSetEditorComponent(ctx);
		setupFooter(pi, ctx);
	}

	pi.on("session_start", setup);
	pi.on("session_switch", setup);
}
