import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { MARK_DATA_URI } from "@/components/Logo";

export const alt = "Owed: the assistant you CC. It remembers what people owe you, and gets it back.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link preview card: the promise on the left, one overdue IOU slip on the right.
// Brand fonts as static TTF (the image renderer cannot read woff2). Same OFL licenses as app/fonts.
const font = (file: string) => readFile(join(process.cwd(), "app/fonts", file));

export default async function OpenGraphImage() {
  const [display, body, bodyBold] = await Promise.all([
    font("bricolage-grotesque-800.ttf"),
    font("public-sans-400.ttf"),
    font("public-sans-700.ttf"),
  ]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#e8ecef", display: "flex", alignItems: "center", padding: 80, gap: 64, fontFamily: "Public Sans" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <img src={MARK_DATA_URI} width={96} height={96} alt="" />
            <div style={{ fontFamily: "Bricolage", fontSize: 96, fontWeight: 800, color: "#1a2230", letterSpacing: -4 }}>Owed</div>
          </div>
          <div style={{ fontSize: 40, color: "#1a2230", marginTop: 40, lineHeight: 1.3 }}>
            The assistant you CC. It remembers what people owe you, and gets it back.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: 380, background: "#ffffff", borderRadius: 16, borderLeft: "10px solid #b4233c", padding: 36 }}>
          <div style={{ fontFamily: "Bricolage", fontSize: 72, fontWeight: 800, color: "#b4233c" }}>$1,800</div>
          <div style={{ fontSize: 26, color: "#b4233c", fontWeight: 700, marginTop: 4 }}>Quiet for 5 days</div>
          <div style={{ fontSize: 30, color: "#1a2230", marginTop: 28, fontWeight: 700 }}>Security deposit</div>
          <div style={{ fontSize: 24, color: "#5b6574", marginTop: 6 }}>from Sam Patel</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Bricolage", data: display, weight: 800 },
        { name: "Public Sans", data: body, weight: 400 },
        { name: "Public Sans", data: bodyBold, weight: 700 },
      ],
    },
  );
}
