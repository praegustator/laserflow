import sharp from 'sharp';

/**
 * Decoded raster image — a grid of grayscale brightness values.
 * Each pixel is 0-255 (0 = black, 255 = white).
 */
export interface RasterImage {
  /** Grayscale pixel data in row-major order (top-left to bottom-right). */
  pixels: Uint8Array;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
}

/**
 * Decode a Base64 data-URL (PNG, JPEG, etc.) into a grayscale {@link RasterImage}.
 *
 * The data-URL must start with `data:image/…;base64,`.
 *
 * Transparent pixels are composited over a white background before grayscale
 * conversion, so fully-transparent areas engrave at zero power (no marking)
 * rather than being treated as black (full power).
 */
export async function decodeImageDataUrl(dataUrl: string): Promise<RasterImage> {
  const match = dataUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
  if (!match) throw new Error('Invalid image data URL');

  const buf = Buffer.from(match[1], 'base64');
  const { data, info } = await sharp(buf)
    // Flatten alpha channel against white before converting to grayscale.
    // Without this, sharp maps transparent pixels to black (0), which would
    // engrave fully-transparent areas at maximum laser power.
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}
