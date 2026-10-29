import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const filePath = join(
    process.cwd(),
    "public",
    ".well-known",
    "apple-developer-merchantid-domain-association",
  );

  const content = readFileSync(filePath, "utf-8");

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
