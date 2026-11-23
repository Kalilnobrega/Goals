const FULL_SIDE = 2560;
const FULL_QUALITY = 0.9;
const FEED_WIDTH = 1080;
const FEED_HEIGHT = 1350;
const FEED_QUALITY = 0.8;
export const FEED_RATIO = FEED_WIDTH / FEED_HEIGHT;

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    image.src = url;
  });
}

function encode(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', quality);
  });
}

export async function preparePhoto(file) {
  const source = await decode(file);
  const scale = Math.min(1, FULL_SIDE / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  const blob = await encode(canvas, FULL_QUALITY);
  return { blob, width, height, url: URL.createObjectURL(blob), position: { x: 50, y: 50 } };
}

export function cropBox(width, height, position) {
  if (width / height > FEED_RATIO) {
    const cropWidth = height * FEED_RATIO;
    return { x: (width - cropWidth) * (position.x / 100), y: 0, width: cropWidth, height };
  }
  const cropHeight = width / FEED_RATIO;
  return { x: 0, y: (height - cropHeight) * (position.y / 100), width, height: cropHeight };
}

export async function cropForFeed(photo) {
  const source = await decode(photo.blob);
  const box = cropBox(source.width, source.height, photo.position);
  const canvas = document.createElement('canvas');
  canvas.width = FEED_WIDTH;
  canvas.height = FEED_HEIGHT;
  canvas.getContext('2d').drawImage(source, box.x, box.y, box.width, box.height, 0, 0, FEED_WIDTH, FEED_HEIGHT);
  if (source.close) source.close();
  return { blob: await encode(canvas, FEED_QUALITY), width: FEED_WIDTH, height: FEED_HEIGHT };
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

export function timeAgo(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'agora';
  if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour');
  if (seconds < 7 * 86400) return relative.format(-Math.floor(seconds / 86400), 'day');
  return dayMonth.format(new Date(iso)).replace('.', '');
}
