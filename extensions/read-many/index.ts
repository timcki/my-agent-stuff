/**
 * read-many — Batch file reads via a single read_many tool call.
 *
 * Reads multiple files in one call using pi's built-in read tool,
 * returns combined output with compact rendering.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerReadManyTool } from "./tool.js";

export default function (pi: ExtensionAPI) {
	registerReadManyTool(pi);
}
