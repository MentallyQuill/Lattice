export function boundary(text: string, at: number): boolean;
export function literalHits(text: string, pattern: string, caseSensitive: boolean): Generator<{ start: number; end: number; text: string }>;
export function literalCoverage(text: string, pins: readonly string[], caseSensitive: boolean): (start: number, end: number) => boolean;
