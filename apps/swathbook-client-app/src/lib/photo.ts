import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** A profile photo ready to upload: a square JPEG, at most 512px across. */
export type ProfilePhoto = { bytes: ArrayBuffer; contentType: 'image/jpeg'; extension: 'jpg' };

const SIZE = 512;

/**
 * Opens the photo library and returns the chosen photo cropped square and
 * shrunk to upload size, or null if they backed out. iOS and Android crop in
 * the picker; on web (no crop UI) the middle square is used.
 */
export async function pickProfilePhoto(): Promise<ProfilePhoto | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;

  const side = Math.min(asset.width, asset.height);
  if (!(side > 0)) throw new Error('The photo has no size.');
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width !== asset.height) {
    context.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
  }
  // Both sides, not `height: null`: on web the manipulator doesn't work out the missing one.
  const target = Math.min(SIZE, side);
  context.resize({ width: target, height: target });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('The photo could not be read.');
  return { bytes: base64ToBytes(saved.base64), contentType: 'image/jpeg', extension: 'jpg' };
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  // atob() yields one character per byte (0–255).
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes.buffer;
}
