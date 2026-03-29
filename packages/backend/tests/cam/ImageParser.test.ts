import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { decodeImageDataUrl } from '../../src/cam/ImageParser.js';

/** Helper: create a PNG data URL from raw grayscale pixel values. */
async function makeGrayscalePng(pixels: number[], width: number, height: number): Promise<string> {
  const buf = await sharp(Buffer.from(pixels), { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  return 'data:image/png;base64,' + buf.toString('base64');
}

/** Helper: create a JPEG data URL from raw grayscale pixel values. */
async function makeGrayscaleJpeg(pixels: number[], width: number, height: number): Promise<string> {
  const buf = await sharp(Buffer.from(pixels), { raw: { width, height, channels: 1 } })
    .jpeg({ quality: 100 })
    .toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

describe('ImageParser', () => {
  it('decodes a PNG data URL to grayscale pixels', async () => {
    const dataUrl = await makeGrayscalePng([0, 128, 255, 64], 2, 2);
    const image = await decodeImageDataUrl(dataUrl);

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.pixels.length).toBe(4);
    // Verify pixel values
    expect(image.pixels[0]).toBe(0);   // black
    expect(image.pixels[1]).toBe(128); // mid-gray
    expect(image.pixels[2]).toBe(255); // white
    expect(image.pixels[3]).toBe(64);  // dark gray
  });

  it('decodes a JPEG data URL to grayscale pixels', async () => {
    // JPEG is lossy, so we use large uniform blocks for reliable values
    const dataUrl = await makeGrayscaleJpeg([0, 0, 0, 0], 2, 2);
    const image = await decodeImageDataUrl(dataUrl);

    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(image.pixels.length).toBe(4);
    // JPEG lossy compression means values might not be exact
    for (let i = 0; i < 4; i++) {
      expect(image.pixels[i]).toBeLessThan(20); // close to black
    }
  });

  it('rejects invalid data URLs', async () => {
    await expect(decodeImageDataUrl('not-a-data-url')).rejects.toThrow('Invalid image data URL');
    await expect(decodeImageDataUrl('')).rejects.toThrow('Invalid image data URL');
  });

  it('handles color images by converting to grayscale', async () => {
    // Create a 2×1 RGB image: red pixel, blue pixel
    const rgbPixels = Buffer.from([255, 0, 0, 0, 0, 255]); // R,G,B, R,G,B
    const buf = await sharp(rgbPixels, { raw: { width: 2, height: 1, channels: 3 } })
      .png()
      .toBuffer();
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64');

    const image = await decodeImageDataUrl(dataUrl);
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect(image.pixels.length).toBe(2);
    // Red (255,0,0) and Blue (0,0,255) converted to grayscale by sharp.
    // Exact values depend on sharp's grayscale formula (Rec709).
    // Just verify they're both in a reasonable non-zero range and red is brighter than blue.
    expect(image.pixels[0]).toBeGreaterThan(20);   // red luminance
    expect(image.pixels[0]).toBeLessThan(200);
    expect(image.pixels[1]).toBeGreaterThan(5);    // blue luminance
    expect(image.pixels[1]).toBeLessThan(80);
    expect(image.pixels[0]).toBeGreaterThan(image.pixels[1]); // red brighter than blue
  });
});
