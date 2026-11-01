import { formatVND, parseVndBigInt } from './utils';

describe('Financial Math & Currency Utility (ADR-007 / AGENTS.md)', () => {
  it('should parse numeric strings to BigInt without IEEE-754 precision loss', () => {
    expect(parseVndBigInt('17990000')).toBe(BigInt(17990000));
    expect(parseVndBigInt('19.990.000 ₫')).toBe(BigInt(19990000));
    expect(parseVndBigInt('invalid')).toBe(BigInt(0));
    expect(parseVndBigInt(undefined)).toBe(BigInt(0));
  });

  it('should format VND currency accurately with Vietnamese locale symbol', () => {
    const formatted = formatVND(17990000);
    expect(formatted).toContain('17.990.000');
    expect(formatted).toContain('₫');

    const formattedBigInt = formatVND(BigInt(24990000));
    expect(formattedBigInt).toContain('24.990.000');
    expect(formattedBigInt).toContain('₫');
  });

  it('should format 0 VND correctly', () => {
    const formatted = formatVND(0);
    expect(formatted).toContain('0');
    expect(formatted).toContain('₫');
  });
});

