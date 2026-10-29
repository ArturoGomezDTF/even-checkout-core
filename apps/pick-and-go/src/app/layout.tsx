import type { Metadata } from "next";
import { DM_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { GuestProvider } from "@/context/GuestContext";
import { RestaurantProvider } from "@/context/RestaurantContext";
import { BranchProvider } from "@/context/BranchContext";
import { CartProvider } from "@/context/CartContext";
import { PickAndGoProvider } from "@/context/PickAndGoContext";
import { UserDataProvider } from "@/context/userDataContext";
import { PaymentProvider } from "@/context/PaymentContext";
import { PepperProvider } from "@/context/PepperContext";
import AuthCartSync from "@/components/AuthCartSync";
import Script from "next/script";

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RootLayout");
  const title = t("title");
  const description = t("description");
  return {
    metadataBase: new URL("https://pg.letseven.io"),
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Even Pick & Go",
      url: "/",
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;
  void nonce;

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`${dmMono.variable} ${jakarta.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-mono)" }}
      >
        <Script
          src="https://pay.ecart.com/sdk/pay.js"
          strategy="afterInteractive"
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <GuestProvider>
              <BranchProvider>
                <RestaurantProvider>
                  <CartProvider>
                    <AuthCartSync />
                    <PepperProvider>
                      <PickAndGoProvider>
                        <PaymentProvider>
                          <UserDataProvider>{children}</UserDataProvider>
                        </PaymentProvider>
                      </PickAndGoProvider>
                    </PepperProvider>
                  </CartProvider>
                </RestaurantProvider>
              </BranchProvider>
            </GuestProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
