/**
 * user-message-frame – Renders user messages as right-aligned chat bubbles
 * with rounded frames matching the amp-frame aesthetic.
 *
 * Monkey-patches UserMessageComponent.prototype.render to wrap output
 * in a bordered, indented frame colored by the current thinking level.
 *
 * Kill switch: set PI_USER_MESSAGE_FRAME=0 in environment to disable.
 */

import {
	type ExtensionAPI,
	type ExtensionContext,
	UserMessageComponent,
} from "@mariozechner/pi-coding-agent";
import { wrapInFrame } from "./frame.js";

// ── Guard against double-patching ─────────────────────────────────────────────

const PATCHED = Symbol.for("user-message-frame-patched");

// ── Minimum width to apply framing ────────────────────────────────────────────

const MIN_FRAME_WIDTH = 20;

// ── Shared state ──────────────────────────────────────────────────────────────

let currentCtx: ExtensionContext | undefined;
let currentPi: ExtensionAPI | undefined;

// ── Extension entry point ─────────────────────────────────────────────────────

export default function userMessageFrame(pi: ExtensionAPI) {
	if (process.env.PI_USER_MESSAGE_FRAME === "0") return;

	function patchPrototype(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		const proto = UserMessageComponent.prototype as any;
		if (proto[PATCHED]) return;
		proto[PATCHED] = true;

		const originalRender: (width: number) => string[] = proto.render;

		proto.render = function patchedRender(width: number): string[] {
			if (width < MIN_FRAME_WIDTH) {
				return originalRender.call(this, width);
			}

			try {
				const indent = Math.max(4, Math.floor(width * 0.2));
				const innerWidth = width - indent - 2; // 2 for │ borders

				if (innerWidth < 1) {
					return originalRender.call(this, width);
				}

				// Render content at narrower width so Markdown wraps correctly
				const contentLines = originalRender.call(this, innerWidth);

				// Get border color from current thinking level
				let colorFn: (s: string) => string = (s) => s;
				if (currentCtx?.hasUI && currentPi) {
					const level = currentPi.getThinkingLevel();
					colorFn = currentCtx.ui.theme.getThinkingBorderColor(level);
				}

				return wrapInFrame(contentLines, width, indent, colorFn);
			} catch {
				// Fallback to original on any error
				return originalRender.call(this, width);
			}
		};
	}

	function setup(_event: any, ctx: ExtensionContext) {
		currentCtx = ctx;
		currentPi = pi;
		patchPrototype(ctx);
	}

	pi.on("session_start", setup);
	pi.on("session_switch", setup);
}
