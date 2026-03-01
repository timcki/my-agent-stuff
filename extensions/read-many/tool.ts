/**
 * read_many tool definition: schema, execute, renderCall, renderResult.
 *
 * Reads multiple files in one tool call using pi's built-in read tool,
 * returns combined output with per-file framed blocks.
 */

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createReadTool,
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { renderCompactBlock, makeExpandHint, formatBytes } from "./rendering.js";
import { summarizeReadMany, type ReadManyDetails } from "./summary.js";

const ReadManySchema = Type.Object({
	files: Type.Array(
		Type.Object({
			path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
			offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
			limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
		}),
		{
			minItems: 1,
			maxItems: 26,
			description: "Files to read in the exact order listed (max 26)",
		},
	),
	stopOnError: Type.Optional(Type.Boolean({ description: "Stop on first error (default false)" })),
});

interface ReadManyInput {
	files: Array<{ path: string; offset?: number; limit?: number }>;
	stopOnError?: boolean;
}

function formatFileBlock(path: string, content: string, index: number): string {
	return `@${path}\n--- file ${index + 1} ---\n${content}\n--- end ---`;
}

function getTextContent(content: Array<{ type: string; text?: string }>): string {
	return content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => c.text!)
		.join("\n");
}

export function registerReadManyTool(pi: ExtensionAPI): void {
	let lastArgs: ReadManyInput = { files: [] };
	let lastStatus: { isError: boolean } | null = null;

	pi.registerTool({
		name: "read_many",
		label: "Read Many",
		description: `Read multiple files in one call with per-file offset/limit. Returns combined output with per-file framed blocks. Under output limits (${DEFAULT_MAX_LINES} lines / ${formatSize(DEFAULT_MAX_BYTES)}), files are packed in request order. Image attachments are summarized in text.`,
		parameters: ReadManySchema,

		async execute(
			toolCallId: string,
			params: ReadManyInput,
			signal: AbortSignal | undefined,
			_onUpdate: unknown,
			ctx: { cwd: string },
		) {
			const readTool = createReadTool(ctx.cwd);
			const fileDetails: ReadManyDetails["files"] = [];
			const blocks: string[] = [];

			for (let i = 0; i < params.files.length; i++) {
				if (signal?.aborted) throw new Error("Operation aborted");

				const request = params.files[i];

				try {
					const result = await readTool.execute(
						`${toolCallId}:${i}`,
						{ path: request.path, offset: request.offset, limit: request.limit },
						signal,
						undefined,
					);

					const textChunks = result.content
						.filter((item: any): item is { type: "text"; text: string } => item.type === "text")
						.map((item: any) => item.text);
					const imageCount = result.content.filter((item: any) => item.type === "image").length;

					let body = textChunks.join("\n");
					if (!body) {
						body = imageCount > 0
							? `[${imageCount} image attachment(s); use read for image payload]`
							: "[No text content returned]";
					} else if (imageCount > 0) {
						body += `\n[${imageCount} image attachment(s); use read for image payload]`;
					}

					const lines = body.split("\n").length;
					const bytes = Buffer.byteLength(body, "utf-8");
					blocks.push(formatFileBlock(request.path, body, i));
					fileDetails.push({ path: request.path, ok: true, lines, bytes });
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					blocks.push(formatFileBlock(request.path, `[Error: ${message}]`, i));
					fileDetails.push({ path: request.path, ok: false, error: message });

					if (params.stopOnError) break;
				}
			}

			const combined = blocks.join("\n\n");
			const truncation = truncateHead(combined, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			const details: ReadManyDetails = {
				processedCount: fileDetails.length,
				successCount: fileDetails.filter((f) => f.ok).length,
				errorCount: fileDetails.filter((f) => !f.ok).length,
				files: fileDetails,
				truncated: truncation.truncated,
			};

			return {
				content: [{ type: "text" as const, text: truncation.content }],
				details,
			};
		},

		renderCall(args: ReadManyInput, theme: any) {
			lastArgs = args;
			let text = "";
			if (lastStatus) {
				text += lastStatus.isError
					? theme.fg("error" as any, "✗") + " "
					: theme.fg("success" as any, "✓") + " ";
			}
			text += theme.fg("toolTitle" as any, theme.bold("read_many "));

			const count = args.files.length;
			const paths = args.files.map((f) => f.path);
			let pathList = paths.join(", ");
			if (pathList.length > 80) {
				pathList = paths.slice(0, 3).join(", ");
				if (paths.length > 3) pathList += `, +${paths.length - 3} more`;
			}
			text += theme.fg("muted" as any, `${count} files: `);
			text += theme.fg("dim" as any, pathList);

			return new Text(text, 0, 0);
		},

		renderResult(result: any, { expanded, isPartial }: { expanded: boolean; isPartial: boolean }, theme: any) {
			if (isPartial) {
				const count = lastArgs.files.length;
				return new Text(theme.fg("dim" as any, `Reading ${count} files...`), 0, 0);
			}

			const content = getTextContent(result.content);
			const details = result.details as ReadManyDetails;
			const isError = details ? details.errorCount > 0 && details.successCount === 0 : false;
			lastStatus = { isError };

			const metrics = details
				? summarizeReadMany(details, content, isError)
				: `${formatBytes(Buffer.byteLength(content, "utf-8"))}`;

			const block = renderCompactBlock({
				summary: `↳ ${metrics}`,
				output: content,
				isError,
				expanded,
				expandHint: makeExpandHint(),
			});
			return new Text(block, 0, 0);
		},
	});
}
