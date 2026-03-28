import { describe, it, expect } from 'vitest';
import { parseSvg, parseSvgLength, parseViewBox, computeRootMatrix, parseTransformAttr } from '../../src/cam/SvgParser.js';

/** Helper: extract all absolute X/Y coordinate pairs from a path d string. */
function extractCoords(d: string): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  // Match M/L commands followed by X Y
  const re = /[ML]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/gi;
  let m;
  while ((m = re.exec(d)) !== null) {
    coords.push([parseFloat(m[1]), parseFloat(m[2])]);
  }
  return coords;
}

describe('SvgParser', () => {
  it('extracts path elements from SVG', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <path d="M 0 0 L 100 0 L 100 100 Z"/>
      <path d="M 10 10 L 90 10"/>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(2);
    expect(paths[0].d).toContain('M');
    expect(paths[1].d).toContain('M');
  });

  it('handles SVG with no paths', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(0);
  });

  it('handles rect elements', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="80" height="80"/>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(1);
    expect(paths[0].d).toBeTruthy();
  });

  // ── viewBox + physical units scaling ──────────────────────────────

  it('scales coordinates when viewBox and mm dimensions are present', async () => {
    // Typical Illustrator export: 10mm x 10mm rect, viewBox in points
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="10mm" height="10mm" viewBox="0 0 28.3465 28.3465">
      <rect x="0" y="0" width="28.3465" height="28.3465"/>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(1);
    // The rect coordinates should now be ≈ 0–10 mm (not 0–28.35)
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    const maxY = Math.max(...coords.map(c => c[1]));
    expect(maxX).toBeCloseTo(10, 1);
    expect(maxY).toBeCloseTo(10, 1);
  });

  it('scales coordinates with cm dimensions', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="2cm" height="2cm" viewBox="0 0 100 100">
      <rect width="100" height="100"/>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(maxX).toBeCloseTo(20, 1); // 2cm = 20mm
  });

  it('scales coordinates with in dimensions', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="1in" height="1in" viewBox="0 0 72 72">
      <rect width="72" height="72"/>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(maxX).toBeCloseTo(25.4, 1); // 1in = 25.4mm
  });

  it('scales coordinates with pt dimensions', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="28.3465pt" height="28.3465pt" viewBox="0 0 28.3465 28.3465">
      <rect width="28.3465" height="28.3465"/>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(maxX).toBeCloseTo(10, 1); // 28.3465pt = 10mm
  });

  it('does NOT scale when dimensions are unitless (backward compat)', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="100" height="100" viewBox="0 0 100 100">
      <rect width="100" height="100"/>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(maxX).toBeCloseTo(100, 1); // Unchanged
  });

  it('does NOT scale when dimensions are in px (backward compat)', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="100px" height="100px" viewBox="0 0 100 100">
      <rect width="100" height="100"/>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(maxX).toBeCloseTo(100, 1); // Unchanged
  });

  it('handles non-zero viewBox origin', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="10mm" height="10mm" viewBox="10 20 28.3465 28.3465">
      <rect x="10" y="20" width="28.3465" height="28.3465"/>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const minX = Math.min(...coords.map(c => c[0]));
    const minY = Math.min(...coords.map(c => c[1]));
    expect(minX).toBeCloseTo(0, 1);
    expect(minY).toBeCloseTo(0, 1);
  });

  // ── Non-visual element filtering ──────────────────────────────────

  it('skips paths inside <defs>', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="clip">
          <rect width="100" height="100"/>
        </clipPath>
      </defs>
      <rect x="0" y="0" width="50" height="50"/>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(1); // Only the visible rect
  });

  it('skips paths inside <clipPath>', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <clipPath id="clip">
        <rect width="200" height="200"/>
      </clipPath>
      <rect width="50" height="50"/>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(1);
  });

  it('skips paths inside <mask>', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <mask id="m"><rect width="100" height="100"/></mask>
      <rect width="50" height="50"/>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(1);
  });

  // ── Element transform handling ────────────────────────────────────

  it('applies translate transform on <g>', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(10, 20)">
        <rect width="5" height="5"/>
      </g>
    </svg>`;
    const paths = await parseSvg(svg);
    expect(paths).toHaveLength(1);
    const coords = extractCoords(paths[0].d);
    // Rect origin should be shifted to (10, 20)
    const minX = Math.min(...coords.map(c => c[0]));
    const minY = Math.min(...coords.map(c => c[1]));
    expect(minX).toBeCloseTo(10, 3);
    expect(minY).toBeCloseTo(20, 3);
  });

  it('applies scale transform on <g>', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="scale(2)">
        <rect width="10" height="10"/>
      </g>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(maxX).toBeCloseTo(20, 3); // 10 * 2
  });

  it('applies matrix transform on <g>', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="matrix(1 0 0 1 5 10)">
        <rect width="10" height="10"/>
      </g>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    const minX = Math.min(...coords.map(c => c[0]));
    const minY = Math.min(...coords.map(c => c[1]));
    expect(minX).toBeCloseTo(5, 3);
    expect(minY).toBeCloseTo(10, 3);
  });

  it('combines nested transforms', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(10, 0)">
        <g transform="scale(3)">
          <rect width="5" height="5"/>
        </g>
      </g>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    // Inner rect: 0-5 * 3 = 0-15, then + 10 → 10-25
    const minX = Math.min(...coords.map(c => c[0]));
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(minX).toBeCloseTo(10, 3);
    expect(maxX).toBeCloseTo(25, 3);
  });

  it('combines viewBox scaling with element transforms', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"
      width="10mm" height="10mm" viewBox="0 0 100 100">
      <g transform="translate(50, 50)">
        <rect width="50" height="50"/>
      </g>
    </svg>`;
    const paths = await parseSvg(svg);
    const coords = extractCoords(paths[0].d);
    // viewBox scale: 10/100 = 0.1 mm/unit
    // translate(50,50) → origin at 5mm, rect to (50+50)*0.1 = 10mm
    const minX = Math.min(...coords.map(c => c[0]));
    const maxX = Math.max(...coords.map(c => c[0]));
    expect(minX).toBeCloseTo(5, 1);
    expect(maxX).toBeCloseTo(10, 1);
  });
});

// ── Unit tests for exported helpers ───────────────────────────────────

describe('parseSvgLength', () => {
  it('parses mm', () => expect(parseSvgLength('10mm')).toBeCloseTo(10));
  it('parses cm', () => expect(parseSvgLength('2cm')).toBeCloseTo(20));
  it('parses in', () => expect(parseSvgLength('1in')).toBeCloseTo(25.4));
  it('parses pt', () => expect(parseSvgLength('72pt')).toBeCloseTo(25.4));
  it('parses pc', () => expect(parseSvgLength('6pc')).toBeCloseTo(25.4));
  it('returns null for unitless', () => expect(parseSvgLength('100')).toBeNull());
  it('returns null for px', () => expect(parseSvgLength('100px')).toBeNull());
  it('returns null for undefined', () => expect(parseSvgLength(undefined)).toBeNull());
  it('returns null for empty string', () => expect(parseSvgLength('')).toBeNull());
});

describe('parseViewBox', () => {
  it('parses standard viewBox', () => {
    const vb = parseViewBox('0 0 100 200');
    expect(vb).toEqual({ minX: 0, minY: 0, width: 100, height: 200 });
  });
  it('handles comma separators', () => {
    const vb = parseViewBox('10,20,300,400');
    expect(vb).toEqual({ minX: 10, minY: 20, width: 300, height: 400 });
  });
  it('returns null for invalid viewBox', () => {
    expect(parseViewBox('abc')).toBeNull();
    expect(parseViewBox(undefined)).toBeNull();
    expect(parseViewBox('0 0 0 0')).toBeNull(); // zero dimensions
    expect(parseViewBox('0 0 -10 -10')).toBeNull(); // negative dimensions
  });
});

describe('computeRootMatrix', () => {
  it('returns identity when no viewBox or dimensions', () => {
    expect(computeRootMatrix({})).toEqual([1, 0, 0, 1, 0, 0]);
  });
  it('computes scale for viewBox + mm dimensions', () => {
    const m = computeRootMatrix({ width: '10mm', height: '10mm', viewBox: '0 0 100 100' });
    expect(m[0]).toBeCloseTo(0.1); // sx
    expect(m[3]).toBeCloseTo(0.1); // sy
  });
});

describe('parseTransformAttr', () => {
  it('parses translate', () => {
    const m = parseTransformAttr('translate(10, 20)');
    expect(m).toEqual([1, 0, 0, 1, 10, 20]);
  });
  it('parses scale', () => {
    const m = parseTransformAttr('scale(2, 3)');
    expect(m).toEqual([2, 0, 0, 3, 0, 0]);
  });
  it('parses uniform scale', () => {
    const m = parseTransformAttr('scale(5)');
    expect(m).toEqual([5, 0, 0, 5, 0, 0]);
  });
  it('parses combined transforms', () => {
    const m = parseTransformAttr('translate(10, 0) scale(2)');
    // SVG applies right-to-left: scale(2) first, then translate(10,0).
    // x' = 2*x + 10, y' = 2*y
    expect(m[0]).toBeCloseTo(2);
    expect(m[4]).toBeCloseTo(10);
  });
});
