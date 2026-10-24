/**
 * image-resize.ts
 *
 * Shrinks a picked image in the browser before upload: phone photos are often
 * 4-12 MB, well over what a Server Action accepts. Re-encoding also applies the
 * EXIF rotation and drops EXIF metadata, including the GPS location phones embed.
 *
 * @module src/libs/image-resize
 * @since 1.0.0
 */

export type ShrinkOptions = {
    /** Longest edge in pixels. */
    maxSize: number;
    /** 0-1, for lossy formats. */
    quality?: number;
};

async function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function shrinkImage(file: File, { maxSize, quality = 0.82 }: ShrinkOptions): Promise<File> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas isn't available.");
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // WebP where the browser can encode it (it falls back to PNG silently), else JPEG.
    let blob = await encode(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
    if (!blob) throw new Error("Couldn't process that image.");

    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.${extension}`, { type: blob.type });
}
