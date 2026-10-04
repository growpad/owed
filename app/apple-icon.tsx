import { ImageResponse } from "next/og";
import { MARK_DATA_URI } from "@/components/Logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon: the same mark, slightly zoomed to full bleed (iOS rounds the corners itself).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1a2230", alignItems: "center", justifyContent: "center" }}>
        <img src={MARK_DATA_URI} width={206} height={206} alt="" />
      </div>
    ),
    size,
  );
}
