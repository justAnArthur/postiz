import { BadRequestException } from '@nestjs/common';
import { pipeline, Readable, Transform } from 'stream';
import { IUploadProvider } from './upload.interface';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fileTypeStream } = require('file-type');

// The media library takes any file: raw clips, photos, documents. Only what a browser
// would run when the uploads folder serves it from the app's own origin is refused,
// and a type the sniffer cannot name is stored as an opaque download
const ACTIVE_MIME = new Set<string>([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
]);
const OPAQUE = { mime: 'application/octet-stream', ext: 'bin' };

export const isActiveContent = (mime: string) => ACTIVE_MIME.has(mime);

/** The type a file is stored as: what its bytes say, or an opaque download. */
export function storedType(detected?: { mime: string; ext: string }) {
  if (!detected) return OPAQUE;
  if (isActiveContent(detected.mime)) {
    throw new BadRequestException('Unsupported file type.');
  }
  return detected;
}

export function getMaxSize(mimeType: string): number {
  if (mimeType.startsWith('image/')) {
    return 100 * 1024 * 1024; // 100 MB: a phone's raw photo
  }
  return 1024 * 1024 * 1024; // 1 GB
}

// Passes bytes through and fails once they exceed maxSize, so a body with a
// missing or lying Content-Length cannot be streamed into storage unbounded
export function maxSizeStream(maxSize: number) {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > maxSize) {
        return callback(new BadRequestException('File is too large.'));
      }
      callback(null, chunk);
    },
  });
}

// Sniffs the real type from the first bytes, applies the per-type size cap
// and streams the rest into storage, so only the sniffing prefix and a few
// upload parts are ever in memory. Rejections are BadRequestException with
// the same messages the old buffer validation used. `declaredSize` is the
// Content-Length when the sender gave one; it may be absent or wrong, so the
// stream cap is what really enforces the limit
export async function uploadStreamToStorage(
  storage: IUploadProvider,
  webStream: ReadableStream,
  declaredSize = 0
) {
  let sniffed: ReadableStream & { fileType?: { mime: string; ext: string } };
  try {
    sniffed = await fileTypeStream(webStream);
  } catch (err) {
    throw new BadRequestException('Failed to read file', { cause: err });
  }
  let detected: { mime: string; ext: string };
  try {
    detected = storedType(sniffed.fileType);
  } catch (err) {
    await sniffed.cancel();
    throw err;
  }

  const maxSize = getMaxSize(detected.mime);
  if (declaredSize > maxSize) {
    await sniffed.cancel();
    throw new BadRequestException('File is too large.');
  }

  // pipeline (not pipe) so failing the cap also tears down the source
  const body = pipeline(
    Readable.fromWeb(sniffed as any),
    maxSizeStream(maxSize),
    () => {}
  );

  try {
    const uploaded = await storage.uploadStream(
      body,
      detected.mime,
      detected.ext
    );
    return { ...uploaded, ext: detected.ext };
  } catch (err) {
    // The size cap rejects mid-upload with its own BadRequestException
    body.destroy();
    throw err;
  }
}
