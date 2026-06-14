import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Button } from './Button';

interface QrScannerProps {
  active: boolean;
  onScan: (value: string) => void;
  onError?: (error: string) => void;
}

export function QrScanner({ active, onScan, onError }: QrScannerProps) {
  const htmlId = useId().replace(/:/g, '');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const [ready, setReady] = useState(false);
  const [manualStart, setManualStart] = useState(false);

  useEffect(() => {
    if (!active || !manualStart) return undefined;
    let disposed = false;
    const scanner = new Html5Qrcode(htmlId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          const now = Date.now();
          const last = lastScanRef.current;
          // Booth labels can stay in the camera frame. This debounce prevents a
          // single label from filling the cart while still allowing intentional
          // repeat scans after a short pause.
          if (last.value === decodedText && now - last.at < 1500) return;
          lastScanRef.current = { value: decodedText, at: now };
          onScan(decodedText);
        },
        () => undefined
      )
      .then(() => {
        if (!disposed) setReady(true);
      })
      .catch((error) => {
        onError?.(error instanceof Error ? error.message : 'camera unavailable');
        setManualStart(false);
      });

    return () => {
      disposed = true;
      setReady(false);
      scanner
        .stop()
        .catch(() => undefined)
        .finally(() => {
          try {
            scanner.clear();
          } catch {
            // Scanner cleanup is best-effort when permissions are interrupted.
          }
        });
      scannerRef.current = null;
    };
  }, [active, htmlId, manualStart, onError, onScan]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-black">
      {!manualStart ? (
        <div className="grid min-h-64 place-items-center p-4 text-center text-white">
          <Button onClick={() => setManualStart(true)}>Start camera</Button>
        </div>
      ) : (
        <div className="relative min-h-64">
          <div id={htmlId} className="min-h-64" />
          {!ready && <div className="absolute inset-0 grid place-items-center bg-black/70 text-sm text-white">Opening camera...</div>}
        </div>
      )}
    </div>
  );
}
