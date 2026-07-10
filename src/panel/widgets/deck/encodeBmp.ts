// Hand-rolled 24bpp BITMAPINFOHEADER encoder for the gen-1 Stream Deck wire
// format (Original / Mini family). No image library in the dependency tree
// can write this cheaply enough to justify one, and the format is simple: a
// 14-byte file header, a 40-byte BITMAPINFOHEADER, then bottom-up BGR rows
// padded to a 4-byte boundary.
import type { RawImage } from './deckKeyTransform';

const FILE_HEADER_SIZE = 14;
const DIB_HEADER_SIZE = 40;
const PIXEL_DATA_OFFSET = FILE_HEADER_SIZE + DIB_HEADER_SIZE;
const BYTES_PER_PIXEL = 3;

function rowStride(width: number): number {
  return Math.ceil((width * BYTES_PER_PIXEL) / 4) * 4;
}

/** Encode an RGBA raster (top-down) as a 24bpp bottom-up BGR BMP. */
export function encodeBmp(img: RawImage): Uint8Array {
  const { width, height, data } = img;
  const stride = rowStride(width);
  const pixelDataSize = stride * height;
  const fileSize = PIXEL_DATA_OFFSET + pixelDataSize;

  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);

  // File header ("BM", file size, reserved, pixel data offset).
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, PIXEL_DATA_OFFSET, true);

  // BITMAPINFOHEADER. Positive height = bottom-up row order.
  view.setUint32(14, DIB_HEADER_SIZE, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bits per pixel
  view.setUint32(30, 0, true); // compression: BI_RGB
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 0, true); // x pixels per meter
  view.setInt32(42, 0, true); // y pixels per meter
  view.setUint32(46, 0, true); // colors used
  view.setUint32(50, 0, true); // important colors

  for (let y = 0; y < height; y++) {
    // Bottom-up: the first row written to the file is the image's last row.
    const srcRow = height - 1 - y;
    const rowOffset = PIXEL_DATA_OFFSET + y * stride;
    for (let x = 0; x < width; x++) {
      const srcOffset = (srcRow * width + x) * 4;
      const dstOffset = rowOffset + x * BYTES_PER_PIXEL;
      out[dstOffset] = data[srcOffset + 2]; // B
      out[dstOffset + 1] = data[srcOffset + 1]; // G
      out[dstOffset + 2] = data[srcOffset]; // R
    }
    // Row padding bytes are already zero from the Uint8Array initializer.
  }

  return out;
}
