import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, negotiateLocale } from "@/i18n/locale";
import { getBackendOrigin } from "@even/api-client";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const backendUrl = getBackendOrigin(
    process.env.NEXT_PUBLIC_API_URL,
    "https://even-backend-production.up.railway.app",
  );
  const isDev = process.env.NODE_ENV === "development";
  const devUrls = isDev ? " http://localhost:5000 ws://localhost:5000" : "";
  const backendHost = backendUrl.replace(/https?:\/\//, "");
  const wsProtocol = isDev ? "ws" : "wss";

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://ecartpay.com https://pay.ecart.com https://applepay.cdn-apple.com https://pay.google.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: ${backendUrl} https://*.supabase.co https://www.gstatic.com https://*.givex.com https://storage.googleapis.com;
    font-src 'self' https://applepay.cdn-apple.com;
    connect-src 'self' ${backendUrl} ${wsProtocol}://${backendHost}${devUrls} https://*.ecartpay.com https://pay.ecart.com https://app.ecart.com https://applepay.cdn-apple.com https://checkoutdev.ecartpay.com https://pay.google.com https://google.com https://www.google.com;
    frame-src https://ecartpay.com https://checkout.ecartpay.com https://pay.ecart.com https://app.ecart.com https://applepay.cdn-apple.com https://*.apple.com https://pay.google.com https://*.cardinalcommerce.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    'camera=(), microphone=(), geolocation=(), payment=(self "https://ecartpay.com" "https://checkout.ecartpay.com" "https://pay.ecart.com" "https://applepay.cdn-apple.com" "https://pay.google.com" "https://geo.cardinalcommerce.com")',
  );
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");

  if (!request.cookies.get(LOCALE_COOKIE)) {
    const detected = negotiateLocale(request.headers.get("accept-language"));
    response.cookies.set(LOCALE_COOKIE, detected, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|manifest\\.json|app\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|otf|ttf)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
