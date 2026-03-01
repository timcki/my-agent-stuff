/**
 * Unit tests for sanitize.ts
 *
 * Run: npx tsx extensions/toolview-compact/__tests__/sanitize.test.ts
 */

import { stripOsc, stripAnsiSgr, stripControlChars, sanitizeForDisplay, toRawView } from "../sanitize.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		passed++;
		console.log(`  ✓ ${message}`);
	} else {
		failed++;
		console.error(`  ✗ ${message}`);
	}
}

function assertEqual(actual: string, expected: string, message: string): void {
	if (actual === expected) {
		passed++;
		console.log(`  ✓ ${message}`);
	} else {
		failed++;
		console.error(`  ✗ ${message}`);
		console.error(`    expected: ${JSON.stringify(expected)}`);
		console.error(`    actual:   ${JSON.stringify(actual)}`);
	}
}

// ── stripOsc ──

console.log("\nstripOsc:");

assertEqual(
	stripOsc("hello\x1b]777;notify;title;body\x07world"),
	"helloworld",
	"strips OSC 777 with BEL terminator",
);

assertEqual(
	stripOsc("before\x1b]8;;https://example.com\x07link text\x1b]8;;\x07after"),
	"beforelink textafter",
	"strips OSC 8 hyperlinks with BEL terminator",
);

assertEqual(
	stripOsc("hello\x1b]777;notify;title;body\x1b\\world"),
	"helloworld",
	"strips OSC 777 with ST terminator",
);

assertEqual(
	stripOsc("before\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\after"),
	"beforelinkafter",
	"strips OSC 8 hyperlinks with ST terminator",
);

assertEqual(
	stripOsc("no escapes here"),
	"no escapes here",
	"preserves text without OSC sequences",
);

assertEqual(
	stripOsc("\x1b]0;window title\x07normal text\x1b]2;icon name\x07more"),
	"normal textmore",
	"strips multiple different OSC sequences",
);

// ── stripAnsiSgr ──

console.log("\nstripAnsiSgr:");

assertEqual(
	stripAnsiSgr("\x1b[31mred text\x1b[0m"),
	"red text",
	"strips SGR color codes",
);

assertEqual(
	stripAnsiSgr("\x1b[1;32;48;5;236mcomplex\x1b[0m"),
	"complex",
	"strips complex SGR sequences",
);

assertEqual(
	stripAnsiSgr("\x1b[2Jscreen clear\x1b[H"),
	"screen clear",
	"strips CSI sequences (clear screen, cursor home)",
);

assertEqual(
	stripAnsiSgr("no ansi here"),
	"no ansi here",
	"preserves text without ANSI sequences",
);

// ── stripControlChars ──

console.log("\nstripControlChars:");

assertEqual(
	stripControlChars("hello\x00world"),
	"helloworld",
	"strips null byte",
);

assertEqual(
	stripControlChars("line1\nline2\ttab"),
	"line1\nline2\ttab",
	"preserves newlines and tabs",
);

assertEqual(
	stripControlChars("bell\x07here"),
	"bellhere",
	"strips BEL character",
);

assertEqual(
	stripControlChars("back\x08space"),
	"backspace",
	"strips backspace",
);

assertEqual(
	stripControlChars("form\x0cfeed"),
	"formfeed",
	"strips form feed",
);

assertEqual(
	stripControlChars("normal text 123!@#"),
	"normal text 123!@#",
	"preserves normal printable text",
);

assertEqual(
	stripControlChars("lone\x1besc"),
	"loneesc",
	"strips lone ESC character",
);

// ── sanitizeForDisplay (full pipeline) ──

console.log("\nsanitizeForDisplay:");

assertEqual(
	sanitizeForDisplay("\x1b]777;notify;title;body\x07\x1b[31mred\x1b[0m\x00text"),
	"redtext",
	"strips OSC + SGR + control chars in pipeline",
);

assertEqual(
	sanitizeForDisplay("clean text\nwith lines"),
	"clean text\nwith lines",
	"preserves clean text unchanged",
);

// OSC crash regression scenarios
assertEqual(
	sanitizeForDisplay("\x1b]777;notify;Task;Complete\x07Output here"),
	"Output here",
	"crash regression: OSC 777 notification",
);

assertEqual(
	sanitizeForDisplay("Click \x1b]8;;https://example.com\x07here\x1b]8;;\x07 for info"),
	"Click here for info",
	"crash regression: OSC 8 hyperlink",
);

// Mixed stress test
const stressInput =
	"\x1b]777;a\x07" +
	"\x1b[1;31m" +
	"visible" +
	"\x1b[0m" +
	"\x1b]8;;url\x1b\\" +
	"\x00\x01\x02" +
	"\nline2" +
	"\x1b]999;long payload with spaces and special chars !@#$%\x07" +
	"end";

assertEqual(
	sanitizeForDisplay(stressInput),
	"visible\nline2end",
	"crash regression: mixed ANSI + OSC + control chars stress test",
);

// Very long line with embedded escapes (width stress)
const longLine = "x".repeat(500) + "\x1b]8;;url\x07" + "y".repeat(500) + "\x1b[31m" + "z".repeat(500);
const sanitizedLong = sanitizeForDisplay(longLine);
assertEqual(
	sanitizedLong,
	"x".repeat(500) + "y".repeat(500) + "z".repeat(500),
	"crash regression: very long line with embedded escapes",
);

// ── toRawView ──

console.log("\ntoRawView:");

const rawInput = "\x1b[31mred\x1b[0m";
assertEqual(toRawView(rawInput), rawInput, "returns original text unchanged");

// ── Summary ──

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
	process.exit(1);
} else {
	console.log("All tests passed! ✓");
}
