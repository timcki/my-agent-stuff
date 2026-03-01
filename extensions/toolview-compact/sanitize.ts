/**
 * Safety sanitizer for tool output.
 *
 * Strips OSC, ANSI SGR, and control characters to prevent layout/crash issues.
 * All width/count calculations must run on sanitized text, never raw.
 */

/**
 * Strip OSC escape sequences (Operating System Command).
 * Handles both BEL (\x07) and ST (\x1b\\) terminators.
 * Covers OSC 777 (notifications), OSC 8 (hyperlinks), and all others.
 */
export function stripOsc(text: string): string {
	// OSC = ESC ] ... (terminated by BEL or ST)
	// BEL terminator: \x07
	// ST terminator: \x1b\\ (ESC + backslash)
	return text.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "");
}

/**
 * Strip ANSI SGR (Select Graphic Rendition) and CSI sequences.
 * Handles color codes, cursor movement, and other CSI sequences.
 */
export function stripAnsiSgr(text: string): string {
	// CSI sequences: ESC [ ... (final byte 0x40-0x7E)
	return text.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "");
}

/**
 * Strip remaining control characters, keeping only printable chars, \n, and \t.
 */
export function stripControlChars(text: string): string {
	// Keep: printable (>= 0x20), \n (0x0a), \t (0x09)
	// Remove: all other control chars (0x00-0x08, 0x0b-0x0c, 0x0e-0x1f, 0x7f)
	// Also remove lone ESC that wasn't part of a sequence
	return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/g, "");
}

/**
 * Full sanitization pipeline for display text.
 * Order matters: OSC first (can contain SGR-like bytes), then SGR, then control chars.
 */
export function sanitizeForDisplay(text: string): string {
	let result = text;
	result = stripOsc(result);
	result = stripAnsiSgr(result);
	result = stripControlChars(result);
	return result;
}

/**
 * Return the original text unchanged (for raw view).
 */
export function toRawView(text: string): string {
	return text;
}
