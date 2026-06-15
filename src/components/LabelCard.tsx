import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { inventoryItemTypeLabels, sealedProductTypeLabels } from '../lib/inventory/productTypes';
import type { InventoryItem } from '../types/domain';

export function LabelCard({ item, currency }: { item: InventoryItem; currency: string }) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    QRCode.toDataURL(item.id, { margin: 1, width: 128 }).then(setSrc).catch(() => setSrc(''));
  }, [item.id]);

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
    </div>
  );
}
