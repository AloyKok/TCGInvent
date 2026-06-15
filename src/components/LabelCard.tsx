import { useEffect, useState } from 'react';
import { Check, Copy, Download, Image as ImageIcon, Share2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { inventoryItemTypeLabels, sealedProductTypeLabels } from '../lib/inventory/productTypes';
import {
  copyPngToClipboard,
  createQrPngBlob,
  downloadBlob,
  qrFilename,
  sharePng
} from '../lib/qr/exportQr';
import type { InventoryItem } from '../types/domain';

export function LabelCard({ item, currency }: { item: InventoryItem; currency: string }) {
  const [src, setSrc] = useState('');
  const [transparentBlob, setTransparentBlob] = useState<Blob | null>(null);
  const [whiteBlob, setWhiteBlob] = useState<Blob | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(item.id, {
      margin: 4,
      width: 256,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    }).then((preview) => {
      if (!cancelled) setSrc(preview);
    }).catch(() => {
      if (!cancelled) setSrc('');
    });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  useEffect(() => {
    if (!showExport) {
      setTransparentBlob(null);
      setWhiteBlob(null);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      createQrPngBlob(item.id, 'transparent'),
      createQrPngBlob(item.id, 'white')
    ]).then(([transparent, white]) => {
      if (cancelled) return;
      setTransparentBlob(transparent);
      setWhiteBlob(white);
    }).catch(() => {
      if (!cancelled) {
        setMessage('Could not prepare QR images');
        setError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, showExport]);

  const report = (text: string, isError = false) => {
    setMessage(text);
    setError(isError);
  };

  const copyImage = async () => {
    if (!whiteBlob) return;
    try {
      await copyPngToClipboard(whiteBlob);
      report('QR image copied');
    } catch (copyError) {
      report(copyError instanceof Error ? copyError.message : 'Could not copy QR image', true);
    }
  };

  const shareImage = async () => {
    if (!whiteBlob) return;
    try {
      await sharePng(whiteBlob, qrFilename(item.itemNumber, 'white'));
      report('QR image shared');
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      report(shareError instanceof Error ? shareError.message : 'Could not share QR image', true);
    }
  };

  return (
    <div className="label-card break-inside-avoid border border-slate-400 bg-white p-2 text-[10px] leading-tight text-black">
      <div className="flex gap-2">
        {src ? <img src={src} alt={`QR ${item.itemNumber}`} className="h-16 w-16" /> : <div className="h-16 w-16 bg-slate-100" />}
        <div className="min-w-0 flex-1">
          <p className="break-all font-bold">{item.itemNumber}</p>
          <p className="truncate font-semibold">{item.itemName}</p>
          {item.itemType === 'single_card' ? (
            <>
              <p>{item.cardNumber} / {item.rarity} / {item.language}</p>
              <p>{item.art} / {item.category} / {item.condition}</p>
            </>
          ) : (
            <>
              <p>{inventoryItemTypeLabels[item.itemType]}</p>
              <p>{item.productCategory ? `${sealedProductTypeLabels[item.productCategory]} / ` : ''}{item.language} / {item.condition}</p>
            </>
          )}
          <p className="mt-1 text-sm font-black">
            {new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(item.askingPrice)}
          </p>
        </div>
      </div>
      <div className="mt-2 border-t border-slate-200 pt-2 print:hidden">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink"
          onClick={() => {
            setShowExport((current) => !current);
            setMessage('');
          }}
          aria-expanded={showExport}
        >
          {showExport ? <X size={18} /> : <ImageIcon size={18} />}
          {showExport ? 'Close QR export' : 'QR image'}
        </button>
        {showExport && (
          <div className="mt-2 grid min-w-0 gap-2 rounded-md bg-slate-50 p-2">
            <div className="mx-auto w-full max-w-56 rounded-md border border-line bg-white p-3">
              {src ? <img src={src} alt={`Export preview for ${item.itemNumber}`} className="aspect-square w-full" /> : <div className="aspect-square w-full animate-pulse bg-slate-200" />}
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!whiteBlob}
                className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-2 text-xs font-semibold disabled:opacity-50"
                onClick={copyImage}
              >
                <Copy className="shrink-0" size={17} /> Copy image
              </button>
              <button
                type="button"
                disabled={!whiteBlob}
                className="flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-2 text-xs font-semibold disabled:opacity-50"
                onClick={shareImage}
              >
                <Share2 className="shrink-0" size={17} /> Share
              </button>
              <button
                type="button"
                disabled={!transparentBlob}
                className="col-span-2 flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => {
                  if (!transparentBlob) return;
                  downloadBlob(transparentBlob, qrFilename(item.itemNumber, 'transparent'));
                  report('Transparent PNG downloaded');
                }}
              >
                <Download className="shrink-0" size={17} /> Transparent PNG
              </button>
              <button
                type="button"
                disabled={!whiteBlob}
                className="col-span-2 flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-2 text-xs font-semibold disabled:opacity-50"
                onClick={() => {
                  if (!whiteBlob) return;
                  downloadBlob(whiteBlob, qrFilename(item.itemNumber, 'white'));
                  report('White PNG downloaded');
                }}
              >
                <Download className="shrink-0" size={17} /> White PNG for thermal printing
              </button>
            </div>
            {message && (
              <p
                className={`flex min-w-0 items-start gap-1.5 break-words text-xs font-semibold ${error ? 'text-danger' : 'text-action'}`}
                role="status"
                aria-live="polite"
              >
                {error ? <X className="mt-0.5 shrink-0" size={14} /> : <Check className="mt-0.5 shrink-0" size={14} />}
                <span>{message}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
