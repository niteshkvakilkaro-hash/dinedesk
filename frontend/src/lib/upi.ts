import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A UPI payment link (NPCI's upi://pay format). Opening it on a phone shows the guest's UPI
 * apps (GPay, PhonePe, Paytm, BHIM…) with the payee and amount filled in; the same text as a
 * QR code can be scanned from any UPI app.
 */
export function upiLink({ vpa, payee, amount, note }: { vpa: string; payee: string; amount: number | string; note: string }) {
  const params = new URLSearchParams({ pa: vpa, pn: payee.slice(0, 50), am: Number(amount).toFixed(2), cu: 'INR', tn: note.slice(0, 50) });
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

export const isPhone = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/** QR code image (data URL) for a text, black on white so every scanner reads it. */
export function useQrCode(text: string | null, width = 240) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!text) {
      setSrc(null);
      return;
    }
    void QRCode.toDataURL(text, { width, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [text, width]);
  return src;
}
