export function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')              // CSI sequences
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')  // OSC sequences (complete)
    .replace(/\x1b\][^\x07\x1b]{0,256}/g, '')            // OSC sequences (truncated/orphaned)
    .replace(/\x1b[P_^][^\x1b]*(?:\x1b\\|\x07)/g, '')    // DCS, APC, PM sequences
    .replace(/\x1b[^[\]P_^]/g, '')                        // Simple two-byte escapes
    .replace(/\r/g, '')                                    // Carriage returns (spinners)
}
