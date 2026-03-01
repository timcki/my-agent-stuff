/**
 * Shared types for toolview-compact extension.
 */

export type ToolviewPreset = "terse" | "regular";

export type ToolName = "read" | "bash" | "edit" | "write" | "find" | "grep" | "ls";

export const ALL_TOOL_NAMES: ToolName[] = ["read", "bash", "edit", "write", "find", "grep", "ls"];

export interface ThresholdConfig {
	maxLines: number;
	maxChars: number;
}

export interface PreviewConfig {
	headLines: number;
	tailLines: number;
}

export interface ToolviewConfig {
	preset: ToolviewPreset;
	rawViewEnabled: boolean;
	toolEnabled: Record<ToolName, boolean>;
	thresholds: Record<ToolviewPreset, ThresholdConfig>;
	preview: PreviewConfig;
}
