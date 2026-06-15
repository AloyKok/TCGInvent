import QRCode from 'qrcode';

const QR_SIZE = 1024;
const QR_MARGIN = 4;

export type QrBackground = 'transparent' | 'white';

export async function createQrPngBlob(value: string, background: QrBackground) {
  const dataUrl = await QRCode.toDataURL(value, {
    width: QR_SIZE,
    margin: QR_MARGIN,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: background === 'transparent' ? '#00000000' : '#ffffff'
    }
  });
  const response = await fetch(dataUrl);
  return response.blob();
}

export function qrFilename(itemNumber: string, background: QrBackground) {
  const safeItemNumber = itemNumber.trim().replace(/[^a-z0-9_-]+/gi, '-');
  return `${safeItemNumber || 'cardpulse'}-qr-${background}.png`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function copyPngToClipboard(blob: Blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image copying is not supported by this browser. Use Share or PNG instead.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export async function sharePng(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    throw new Error('Image sharing is not supported by this browser. Use PNG instead.');
  }
  await navigator.share({
    files: [file],
    title: filename
  });
}
