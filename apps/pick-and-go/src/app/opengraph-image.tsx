import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Even Pick & Go — Ordena, paga y recoge. Tu comida lista cuando llegues";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asteriskSvg = readFileSync(
  join(process.cwd(), "public", "even", "even-asterisk-grass.svg"),
  "utf-8",
);
const asteriskDataUri = `data:image/svg+xml;base64,${Buffer.from(asteriskSvg).toString("base64")}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#023828",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asteriskDataUri} width={340} height={340} alt="" />
      </div>
    ),
    { ...size },
  );
}
