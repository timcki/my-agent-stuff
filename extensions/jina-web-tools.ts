import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const USER_AGENT = "pi-extension-jina-web-tools/1.0";
const DEFAULT_SEARCH_TIMEOUT_SECONDS = 30;
const DEFAULT_VISIT_TIMEOUT_SECONDS = 60;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_CONTENT_LENGTH = 100_000; // chars
const VISIT_RETRY_DELAYS_MS = [0, 30_000, 90_000];

const IMAGE_EXTENSIONS: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
};

type WebSearchParams = {
	query: string;
	timeoutSeconds?: number;
};

type VisitWebpageParams = {
	url: string;
	timeoutSeconds?: number;
};

function getContentType(contentTypeHeader: string | null): string | null {
	if (!contentTypeHeader) return null;
	const normalized = contentTypeHeader.toLowerCase().split(";")[0]?.trim();
	return normalized || null;
}

function getHeaders(options?: {
	includeJinaAuth?: boolean;
	accept?: string;
	extra?: Record<string, string>;
}): Record<string, string> {
	const headers: Record<string, string> = {
		"User-Agent": USER_AGENT,
	};

	if (options?.accept) headers.Accept = options.accept;
	if (options?.extra) Object.assign(headers, options.extra);

	if (options?.includeJinaAuth && process.env.JINA_API_KEY) {
		headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
	}

	return headers;
}

async function fetchWithTimeout(
	url: string,
	init: RequestInit,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<Response> {
	const controller = new AbortController();
	const onAbort = () => controller.abort(signal?.reason ?? new Error("Aborted"));

	if (signal) {
		if (signal.aborted) controller.abort(signal.reason ?? new Error("Aborted"));
		else signal.addEventListener("abort", onAbort, { once: true });
	}

	const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
		if (signal) signal.removeEventListener("abort", onAbort);
	}
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0) return;

	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			if (signal) signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timer);
			if (signal) signal.removeEventListener("abort", onAbort);
			reject(signal?.reason ?? new Error("Aborted"));
		};

		if (signal) {
			if (signal.aborted) {
				onAbort();
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
		}
	});
}

async function writeTempFile(prefix: string, fileName: string, content: string | Buffer): Promise<string> {
	const tempDir = await mkdtemp(join(tmpdir(), prefix));
	const filePath = join(tempDir, fileName);
	await writeFile(filePath, content);
	return filePath;
}

function formatTruncationNotice(
	truncation: ReturnType<typeof truncateHead>,
	fullOutputPath: string,
): string {
	const omittedLines = truncation.totalLines - truncation.outputLines;
	const omittedBytes = truncation.totalBytes - truncation.outputBytes;

	let note = `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	note += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
	note += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
	note += ` Full output saved to: ${fullOutputPath}]`;
	return note;
}

function validateHttpUrl(url: string): URL {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error("URL must be a valid http(s) URL");
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("URL must start with http:// or https://");
	}

	return parsed;
}

export default function jinaWebTools(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: `Search the web using Jina Search API (https://s.jina.ai). Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first).`,
		parameters: Type.Object({
			query: Type.String({ description: "Search query text" }),
			timeoutSeconds: Type.Optional(
				Type.Number({
					description: `Request timeout in seconds (default: ${DEFAULT_SEARCH_TIMEOUT_SECONDS})`,
				}),
			),
		}),

		async execute(_toolCallId, rawParams, signal) {
			const params = rawParams as WebSearchParams;
			const query = params.query?.trim();
			if (!query) {
				return {
					content: [{ type: "text", text: "Error: query must not be empty." }],
					details: { ok: false, reason: "empty-query" },
				};
			}

			const timeoutMs = Math.max(1000, Math.floor((params.timeoutSeconds ?? DEFAULT_SEARCH_TIMEOUT_SECONDS) * 1000));
			const url = `https://s.jina.ai/?q=${encodeURIComponent(query)}`;

			const response = await fetchWithTimeout(
				url,
				{
					method: "GET",
					headers: getHeaders({
						includeJinaAuth: true,
						accept: "text/plain",
						extra: {
							"X-Respond-With": "no-content",
						},
					}),
				},
				timeoutMs,
				signal,
			);

			if (!response.ok) {
				return {
					content: [{ type: "text", text: `Error: HTTP ${response.status} ${response.statusText}` }],
					details: {
						ok: false,
						reason: "http-error",
						status: response.status,
						statusText: response.statusText,
					},
				};
			}

			const body = (await response.text()).trim();
			if (!body) {
				return {
					content: [{ type: "text", text: "No search results found. Try a different query." }],
					details: {
						ok: true,
						query,
						resultCount: 0,
					},
				};
			}

			const output = `## Search Results\n\n${body}`;
			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let finalOutput = truncation.content;
			let fullOutputPath: string | undefined;
			if (truncation.truncated) {
				fullOutputPath = await writeTempFile("pi-web-search-", "results.md", output);
				finalOutput += formatTruncationNotice(truncation, fullOutputPath);
			}

			return {
				content: [{ type: "text", text: finalOutput }],
				details: {
					ok: true,
					query,
					requestUrl: url,
					status: response.status,
					truncated: truncation.truncated,
					truncation: truncation.truncated ? truncation : undefined,
					fullOutputPath,
					hasApiKey: Boolean(process.env.JINA_API_KEY),
				},
			};
		},
	});

	pi.registerTool({
		name: "visit_webpage",
		label: "Visit Webpage",
		description: `Fetch webpage content using Jina Reader API (https://r.jina.ai), or download image URLs to a temp file. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		parameters: Type.Object({
			url: Type.String({ description: "HTTP(S) URL to visit" }),
			timeoutSeconds: Type.Optional(
				Type.Number({
					description: `Request timeout in seconds for each network call (default: ${DEFAULT_VISIT_TIMEOUT_SECONDS})`,
				}),
			),
		}),

		async execute(_toolCallId, rawParams, signal, onUpdate) {
			const params = rawParams as VisitWebpageParams;
			const parsed = validateHttpUrl(params.url);
			const url = parsed.toString();
			const timeoutMs = Math.max(1000, Math.floor((params.timeoutSeconds ?? DEFAULT_VISIT_TIMEOUT_SECONDS) * 1000));

			let contentType: string | null = null;
			try {
				const headResponse = await fetchWithTimeout(
					url,
					{
						method: "HEAD",
						headers: getHeaders(),
					},
					timeoutMs,
					signal,
				);
				if (headResponse.ok) {
					contentType = getContentType(headResponse.headers.get("content-type"));
				}
			} catch {
				// HEAD can fail on some sites. We'll continue and try Jina Reader.
			}

			if (contentType && contentType.startsWith("image/")) {
				const imageResponse = await fetchWithTimeout(
					url,
					{
						method: "GET",
						headers: getHeaders(),
					},
					timeoutMs,
					signal,
				);

				if (!imageResponse.ok) {
					return {
						content: [{ type: "text", text: `Error: HTTP ${imageResponse.status} ${imageResponse.statusText}` }],
						details: {
							ok: false,
							reason: "image-http-error",
							status: imageResponse.status,
							statusText: imageResponse.statusText,
						},
					};
				}

				const imageType = getContentType(imageResponse.headers.get("content-type"));
				if (!imageType || !(imageType in IMAGE_EXTENSIONS)) {
					return {
						content: [{ type: "text", text: `Error: unsupported image type: ${imageType ?? "unknown"}` }],
						details: {
							ok: false,
							reason: "unsupported-image-type",
							contentType: imageType,
						},
					};
				}

				const contentLength = Number.parseInt(imageResponse.headers.get("content-length") ?? "", 10);
				if (!Number.isNaN(contentLength) && contentLength > MAX_IMAGE_SIZE) {
					return {
						content: [
							{
								type: "text",
								text: `Error: image too large (${contentLength} bytes, max ${MAX_IMAGE_SIZE}).`,
							},
						],
						details: {
							ok: false,
							reason: "image-too-large",
							contentLength,
							maxBytes: MAX_IMAGE_SIZE,
						},
					};
				}

				const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
				if (imageBuffer.byteLength > MAX_IMAGE_SIZE) {
					return {
						content: [
							{
								type: "text",
								text: `Error: image too large (${imageBuffer.byteLength} bytes, max ${MAX_IMAGE_SIZE}).`,
							},
						],
						details: {
							ok: false,
							reason: "image-too-large",
							contentLength: imageBuffer.byteLength,
							maxBytes: MAX_IMAGE_SIZE,
						},
					};
				}

				const extension = IMAGE_EXTENSIONS[imageType] ?? ".img";
				const imagePath = await writeTempFile("visit-image-", `image${extension}`, imageBuffer);

				return {
					content: [{ type: "text", text: imagePath }],
					details: {
						ok: true,
						mode: "image",
						url,
						contentType: imageType,
						bytes: imageBuffer.byteLength,
						path: imagePath,
					},
				};
			}

			const jinaUrl = `https://r.jina.ai/${url}`;
			let readerBody = "";
			let readerFetched = false;
			let lastStatus: number | undefined;
			let lastError: unknown;

			for (let i = 0; i < VISIT_RETRY_DELAYS_MS.length; i++) {
				const delayMs = VISIT_RETRY_DELAYS_MS[i] ?? 0;
				if (delayMs > 0) {
					onUpdate?.({
						content: [
							{
								type: "text",
								text: `Waiting ${Math.round(delayMs / 1000)}s before retry ${i + 1}/${VISIT_RETRY_DELAYS_MS.length}...`,
							},
						],
					});
					await sleep(delayMs, signal);
				}

				try {
					const response = await fetchWithTimeout(
						jinaUrl,
						{
							method: "GET",
							headers: getHeaders({
								includeJinaAuth: true,
								accept: "text/plain",
							}),
						},
						timeoutMs,
						signal,
					);

					lastStatus = response.status;
					if (response.ok) {
						readerBody = await response.text();
						readerFetched = true;
						break;
					}

					const shouldRetry = [451, 500, 502, 503, 504].includes(response.status) && i < VISIT_RETRY_DELAYS_MS.length - 1;
					if (!shouldRetry) {
						return {
							content: [{ type: "text", text: `Error: HTTP ${response.status} ${response.statusText}` }],
							details: {
								ok: false,
								reason: "reader-http-error",
								status: response.status,
								statusText: response.statusText,
								jinaUrl,
							},
						};
					}

					onUpdate?.({
						content: [
							{
								type: "text",
								text: `Jina Reader returned HTTP ${response.status}. Retrying...`,
							},
						],
					});
				} catch (error) {
					lastError = error;
					const hasMoreRetries = i < VISIT_RETRY_DELAYS_MS.length - 1;
					if (!hasMoreRetries) break;

					onUpdate?.({
						content: [
							{
								type: "text",
								text: `Network error while calling Jina Reader. Retrying...`,
							},
						],
					});
				}
			}

			if (!readerFetched) {
				const errorMessage = lastError instanceof Error ? lastError.message : "Unknown error";
				return {
					content: [{ type: "text", text: `Error: failed to fetch webpage via Jina Reader (${errorMessage}).` }],
					details: {
						ok: false,
						reason: "reader-failed",
						jinaUrl,
						lastStatus,
					},
				};
			}

			if (!readerBody.trim()) {
				return {
					content: [{ type: "text", text: `No content extracted from ${url}.` }],
					details: {
						ok: true,
						mode: "webpage",
						url,
						jinaUrl,
						empty: true,
						hasApiKey: Boolean(process.env.JINA_API_KEY),
					},
				};
			}

			let cleaned = readerBody.replace(/\n{3,}/g, "\n\n");
			if (cleaned.length > MAX_CONTENT_LENGTH) {
				cleaned = `${cleaned.slice(0, MAX_CONTENT_LENGTH)}\n\n..._Content truncated_...`;
			}

			const output = `## Content from ${url}\n\n${cleaned}`;
			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let finalOutput = truncation.content;
			let fullOutputPath: string | undefined;
			if (truncation.truncated) {
				fullOutputPath = await writeTempFile("pi-visit-webpage-", "content.md", output);
				finalOutput += formatTruncationNotice(truncation, fullOutputPath);
			}

			return {
				content: [{ type: "text", text: finalOutput }],
				details: {
					ok: true,
					mode: "webpage",
					url,
					jinaUrl,
					truncated: truncation.truncated,
					truncation: truncation.truncated ? truncation : undefined,
					fullOutputPath,
					hasApiKey: Boolean(process.env.JINA_API_KEY),
				},
			};
		},
	});
}
