import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Renders a real, scannable QR code for a ticket.
 *
 * What goes in it is only the opaque token: 32 random bytes issued by the
 * server. No name, no email, no event id — a photo of this code tells a
 * stranger nothing, and it is useless without an organizer's scanner session.
 */
export function Qr({ value, size = 232 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size * 2, // rendered at 2x so it stays sharp on phone screens
      color: { dark: '#101014', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div className="state" style={{ width: size, height: size, padding: 16 }}>
        <span className="state__body">We couldn’t draw the QR. Show the code below instead.</span>
      </div>
    );
  }

  if (!dataUrl) return <div className="skeleton" style={{ width: size, height: size }} />;

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Your ticket QR code"
      style={{ display: 'block' }}
    />
  );
}
