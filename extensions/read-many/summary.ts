/**
 * Summary text generation for read_many results.
 */

import { formatBytes } from "./rendering.js";

export interface ReadManyDetails {
	processedCount: number;
	successCount: number;
	errorCount: number;
	files: Array<{ path: string; ok: boolean; error?: string; lines?: number; bytes?: number }>;
	truncated?: boolean;
}

export function summarizeReadMany(details: ReadManyDetails, content: string, isError: boolean): string {
	if (isError) return "error";

	const bytes = Buffer.byteLength(content, "utf-8");
	const parts: string[] = [];
	parts.push(`${details.successCount}/${details.processedCount} files`);
	if (details.errorCount > 0) parts.push(`${details.errorCount} errors`);
	parts.push(formatBytes(bytes));
	if (details.truncated) parts.push("truncated");
	return parts.join(", ");
}
