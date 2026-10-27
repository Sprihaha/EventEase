import { useEffect, useState } from "react";
import QR from "qrcode";

// Real, scannable QR code. `value` is encoded verbatim; ticket refs are wrapped
// into a verification URL so a phone camera resolves to the check-in endpoint.
export function ticketPayload(ref: string, seats?: string) {
  const u = new URL("/verify/" + encodeURIComponent(ref), window.location.origin);
  if (seats) u.searchParams.set("seats", seats);
  return u.toString();
}

export function QRCode({ value, size = 132 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QR.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
      color: { dark: "#1c1526", light: "#ffffff" },
    })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(""));
    return () => {
      alive = false;
    };
  }, [value]);
  return (
    <div
      role="img"
      aria-label="Scannable ticket QR code"
      style={{ width: size, height: size }}
      className="rounded-md ring-2 ring-brand-purple/25 [&>svg]:h-full [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default QRCode;
