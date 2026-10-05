import { env } from "cloudflare:workers";

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_SIDE = 512;

// Ceiling for a whole signup request: the picture plus the form's few text
// fields. Checked against Content-Length before the body is parsed, since
// parsing a multipart form reads all of it into memory.
export const SIGNUP_MAX_BYTES = PHOTO_MAX_BYTES + 64 * 1024;

const objectKey = (key: string) => `avatars/${key}`;

/**
 * Stores a profile picture and returns its key (users.photo_key), or null when
 * the file is too big or not an image.
 *
 * What is stored is never the upload itself: Images decodes it, crops it to a
 * square and re-encodes it as WebP. So only a real, decodable image gets
 * through, at a fixed size, and nothing else in the file (metadata, trailing
 * bytes) survives. The upload is streamed into Images; only the small result
 * is buffered, because R2 needs a length to store a stream.
 *
 * The bucket is public at media.oder.locker, which serves the object with the
 * metadata set here. Keys are random and an object is never rewritten, so it
 * can be cached forever.
 */
export async function photoStore(file: File): Promise<string | null> {
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) return null;

  let image: ArrayBuffer;
  try {
    const result = await env.IMAGES.input(file.stream())
      .transform({ width: PHOTO_SIDE, height: PHOTO_SIDE, fit: "cover" })
      .output({ format: "image/webp", quality: 85 });
    image = await new Response(result.image()).arrayBuffer();
  } catch (e) {
    // not an image Images can decode
    console.error("could not process photo:", e);
    return null;
  }

  const key = crypto.randomUUID();
  await env.PHOTOS.put(objectKey(key), image, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return key;
}

export async function photoDelete(key: string): Promise<void> {
  try {
    await env.PHOTOS.delete(objectKey(key));
  } catch (e) {
    console.error("could not delete photo:", key, e);
  }
}
