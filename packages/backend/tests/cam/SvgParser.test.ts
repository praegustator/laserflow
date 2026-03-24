import { describe, it, expect } from 'vitest';
import { parseSvg } from '../../src/cam/SvgParser.js';

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
});
