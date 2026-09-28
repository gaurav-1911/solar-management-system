/**
 * compressImageFile
 * -----------------
 * Downsizes large images (photos) right before they are uploaded so the
 * photo-heavy modules (Site Survey, Installation, Testing) save much faster.
 *
 * - Only image/* files larger than minBytes are touched. Small images and
 *   PDFs pass through completely untouched — zero quality loss for them.
 * - The longest side is capped at maxDimension px and JPEG quality is applied
 *   via canvas.toBlob, which typically shrinks a 3-5 MB phone photo to a few
 *   hundred KB — several times faster uploads.
 * - EXIF orientation is honored by createImageBitmap, so rotated phone photos
 *   stay correctly oriented.
 * - Any failure (unsupported format, canvas error, …) returns the original
 *   file, so an upload is never blocked by compression.
 *
 * @param {File} file The selected file to compress.
 * @param {object} [opts]
 * @param {number} [opts.maxDimension=1600] Longest side in px.
 * @param {number} [opts.quality=0.72] JPEG quality (0..1).
 * @param {number} [opts.minBytes=400*1024] Files at or below this size are
 *   returned unchanged.
 * @returns {Promise<File>} The (possibly compressed) file to upload.
 */
export async function compressImageFile(
  file,
  { maxDimension = 1600, quality = 0.72, minBytes = 400 * 1024 } = {}
) {
  if (!file || !file.type || !file.type.startsWith("image/")) return file;
  if (file.size <= minBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      if (typeof bitmap.close === "function") bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (typeof bitmap.close === "function") bitmap.close();
      return file;
    }
    // Fill white first so PNG transparency never flattens to black in JPEG
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file; // never keep a worse result

    const base = file.name.replace(/\.(png|webp|bmp|gif)$/i, "");
    return new File([blob], `${base || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
