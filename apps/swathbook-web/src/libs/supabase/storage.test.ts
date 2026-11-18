import { describe, expect, it } from "vitest";
import { imageTypeFromBytes, isDeclaredImage } from "./storage";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("imageTypeFromBytes", () => {
    it("knows PNG, JPEG and WebP by their first bytes", () => {
        expect(imageTypeFromBytes(new Uint8Array(PNG))).toBe("image/png");
        expect(imageTypeFromBytes(new Uint8Array(JPEG))).toBe("image/jpeg");
        expect(imageTypeFromBytes(new Uint8Array(WEBP))).toBe("image/webp");
    });

    it("doesn't recognise anything else", () => {
        expect(imageTypeFromBytes(new TextEncoder().encode("<svg xmlns="))).toBeNull();
        // A RIFF file that isn't WebP (a WAV).
        expect(imageTypeFromBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
        expect(imageTypeFromBytes(new Uint8Array())).toBeNull();
    });
});

describe("isDeclaredImage", () => {
    it("is true only when the bytes match the declared type", async () => {
        expect(await isDeclaredImage(new Blob([new Uint8Array(PNG)], { type: "image/png" }))).toBe(true);
        expect(await isDeclaredImage(new Blob([new Uint8Array(PNG)], { type: "image/jpeg" }))).toBe(false);
        expect(await isDeclaredImage(new Blob(["<html>"], { type: "image/png" }))).toBe(false);
        expect(await isDeclaredImage(new Blob([new Uint8Array(PNG)], { type: "image/svg+xml" }))).toBe(false);
    });
});
