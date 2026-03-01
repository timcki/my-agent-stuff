/**
 * Configuration loading, validation, and persistence.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import type { ToolName, ToolviewConfig, ToolviewPreset, ThresholdConfig, PreviewConfig } from "./types.js";
import { ALL_TOOL_NAMES } from "./types.js";

export const CONFIG_PATH = join(homedir(), ".pi", "tool-display-compact.json");

export function getDefaultConfig(): ToolviewConfig {
	return {
		preset: "regular",
		rawViewEnabled: false,
		toolEnabled: {
			read: true,
			bash: true,
			edit: true,
			write: true,
			find: true,
			grep: true,
			ls: true,
		},
		thresholds: {
			regular: { maxLines: 40, maxChars: 4000 },
			terse: { maxLines: 15, maxChars: 1500 },
		},
		preview: { headLines: 3, tailLines: 2 },
	};
}

function isValidPreset(v: unknown): v is ToolviewPreset {
	return v === "terse" || v === "regular";
}

function isValidThreshold(v: unknown): v is ThresholdConfig {
	if (typeof v !== "object" || v === null) return false;
	const t = v as any;
	return typeof t.maxLines === "number" && t.maxLines > 0 && typeof t.maxChars === "number" && t.maxChars > 0;
}

function isValidPreview(v: unknown): v is PreviewConfig {
	if (typeof v !== "object" || v === null) return false;
	const p = v as any;
	return typeof p.headLines === "number" && p.headLines >= 0 && typeof p.tailLines === "number" && p.tailLines >= 0;
}

export function validateConfig(raw: unknown): ToolviewConfig {
	const defaults = getDefaultConfig();
	if (typeof raw !== "object" || raw === null) return defaults;

	const r = raw as any;
	const config: ToolviewConfig = { ...defaults };

	if (isValidPreset(r.preset)) config.preset = r.preset;
	if (typeof r.rawViewEnabled === "boolean") config.rawViewEnabled = r.rawViewEnabled;

	if (typeof r.toolEnabled === "object" && r.toolEnabled !== null) {
		for (const name of ALL_TOOL_NAMES) {
			if (typeof r.toolEnabled[name] === "boolean") {
				config.toolEnabled[name] = r.toolEnabled[name];
			}
		}
	}

	if (typeof r.thresholds === "object" && r.thresholds !== null) {
		for (const preset of ["regular", "terse"] as ToolviewPreset[]) {
			if (isValidThreshold(r.thresholds[preset])) {
				config.thresholds[preset] = r.thresholds[preset];
			}
		}
	}

	if (isValidPreview(r.preview)) config.preview = r.preview;

	return config;
}

export function loadConfig(): ToolviewConfig {
	try {
		if (!existsSync(CONFIG_PATH)) return getDefaultConfig();
		const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
		return validateConfig(raw);
	} catch {
		return getDefaultConfig();
	}
}

export function saveConfig(config: ToolviewConfig): void {
	const dir = dirname(CONFIG_PATH);
	mkdirSync(dir, { recursive: true });
	const tmpPath = CONFIG_PATH + "." + randomBytes(4).toString("hex") + ".tmp";
	writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
	renameSync(tmpPath, CONFIG_PATH);
}
