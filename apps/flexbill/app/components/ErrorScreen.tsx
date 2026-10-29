import { Home } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface ErrorScreenProps {
  title: string;
  description: string;
  detail?: string;
}

export default function ErrorScreen({
  title,
  description,
  detail,
}: ErrorScreenProps) {
  const router = useRouter();
  const tc = useTranslations("Common");

  return (
    <div className="min-h-new brand-evergreen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="mb-6 md:mb-8 lg:mb-10 text-center">
            <img
              src="/even/even-asterisk-grass.svg"
              alt="Even Logo"
              className="size-16 md:size-20 lg:size-24 mx-auto mb-4 md:mb-5 lg:mb-6"
            />
            <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
              {title}
            </h1>
            <p className="text-white/80 text-sm md:text-base lg:text-lg mb-2">
              {description}
            </p>
            {detail && (
              <p className="text-white/60 text-xs md:text-sm lg:text-base">
                {detail}
              </p>
            )}
          </div>

          {/* Options */}
          <div className="space-y-3 md:space-y-4 lg:space-y-5">
            {/* Go Home Option */}
            <button
              onClick={() => router.push("/")}
              className="w-full bg-white hover:bg-gray-50 text-black py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95"
            >
              <div className="bg-even-grass p-2 md:p-2.5 lg:p-3 rounded-full group-hover:scale-110 transition-transform">
                <Home className="size-5 md:size-6 lg:size-7 text-even-evergreen" />
              </div>
              <div className="flex-1 text-left">
                <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                  {tc("backToHome")}
                </h2>
                <p className="text-xs md:text-sm lg:text-base text-gray-600">
                  {tc("backToHomeSubtitle")}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
