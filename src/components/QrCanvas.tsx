import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QrCanvasProps {
  value: string;
  size?: number;
  className?: string;
}

export function QrCanvas({ value, size = 84, className = '' }: QrCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 1,
        color: {
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      },
      (err) => {
        if (err) console.error('QR render error:', err);
      }
    );
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`rounded bg-white ${className}`}
      aria-label={`QR code for ${value}`}
    />
  );
}
