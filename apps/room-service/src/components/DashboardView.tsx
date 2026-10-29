"use client";

import { useState, lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";
import ProfileTab from "./dashboard/ProfileTab";
const CardsTab = lazy(() => import("./dashboard/CardsTab"));
const HistoryTab = lazy(() => import("./dashboard/HistoryTab"));
const SupportTab = lazy(() => import("./dashboard/SupportTab"));
import DashboardHeader from "./headers/DashboardHeader";
import { useRoomNavigation } from "@/hooks/useRoomNavigation";

interface DashboardViewProps {
  onClose?: () => void;
  onLogout?: () => void;
  initialTab?: "profile" | "cards" | "history" | "support";
}

export default function DashboardView({
  onClose,
  onLogout,
  initialTab,
}: DashboardViewProps = {}) {
  const t = useTranslations("DashboardView");
  const [activeTab, setActiveTab] = useState<
    "profile" | "cards" | "history" | "support"
  >(initialTab || "profile");

  const { user, isAuthenticated, isLoading, profile } = useAuth();
  const { navigateWithRoom } = useRoomNavigation();

  const [supportMessages, setSupportMessages] = useState<
    Array<{ role: "user" | "pepper"; content: string }>
  >([]);
  const [supportSessionId, setSupportSessionId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center ${onClose ? "h-full" : "min-h-dvh brand-evergreen"}`}
      >
        <Loader2 className="size-8 animate-spin text-even-shamrock" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div
        className={`flex flex-col ${onClose ? "h-full" : "min-h-dvh brand-evergreen"}`}
      >
        <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 md:mb-8 lg:mb-10 text-center">
              <img
                src="/even/even-asterisk-grass.svg"
                alt="Even Logo"
                className="size-16 md:size-20 lg:size-24 mx-auto mb-4 md:mb-5 lg:mb-6"
              />
              <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
                {t("accessDenied")}
              </h1>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                {t("loginToAccessProfile")}
              </p>
            </div>

            <div className="space-y-3 md:space-y-4 lg:space-y-5">
              <button
                onClick={() => navigateWithRoom("/auth")}
                className="w-full bg-white hover:bg-gray-50 text-black py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95"
              >
                <div className="bg-even-grass p-2 md:p-2.5 lg:p-3 rounded-full">
                  <svg
                    className="size-5 md:size-6 lg:size-7 text-even-evergreen"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {t("loginCta")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-gray-600">
                    {t("loginCtaSubtitle")}
                  </p>
                </div>
              </button>
            </div>

            <div className="mt-6 md:mt-7 lg:mt-8 text-center">
              <p className="text-white/70 text-xs md:text-sm lg:text-base">
                {t("noAccount")}{" "}
                <button
                  onClick={() => navigateWithRoom("/auth")}
                  className="underline font-medium hover:text-white transition-colors"
                >
                  {t("signUpHere")}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col ${onClose ? "h-full" : "min-h-dvh brand-evergreen"}`}
    >
      <DashboardHeader onClose={onClose} />

      <div className="px-4 md:px-6 lg:px-8 w-full flex-1 flex flex-col">
        {/* Welcome Header */}
        <div
          className={`left-4 right-4 rounded-t-4xl translate-y-7 z-0 ${onClose ? "bg-black/5" : "bg-even-evergreen"}`}
        >
          <div className="py-6 md:py-8 lg:py-10 px-8 md:px-10 lg:px-12 flex flex-col justify-center pb-12 md:pb-14 lg:pb-16">
            <h1
              className={`text-2xl md:text-3xl lg:text-4xl font-medium ${onClose ? "text-black/80" : "text-white"}`}
            >
              {t("welcome", {
                name: profile?.firstName ? ` ${profile.firstName}` : "",
              })}
            </h1>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 md:px-7 lg:px-8 min-h-0">
            {/* Tabs */}
            <div className="relative grid grid-cols-4 gap-2 my-6 md:my-7 lg:my-8 w-full">
              <div
                className="absolute top-0 h-full bg-black rounded-full transition-all duration-300 ease-out"
                style={{
                  left:
                    activeTab === "profile"
                      ? "0%"
                      : activeTab === "support"
                        ? "calc(25% + 0.125rem)"
                        : activeTab === "history"
                          ? "calc(50% + 0.25rem)"
                          : "calc(75% + 0.375rem)",
                  width: "calc(25% - 0.125rem)",
                }}
              />

              <button
                onClick={() => setActiveTab("profile")}
                className={`relative px-1.5 md:px-3 lg:px-4 py-0.5 md:py-1 lg:py-1.5 rounded-full cursor-pointer whitespace-nowrap text-xs md:text-sm lg:text-lg transition-colors duration-300 ${
                  activeTab === "profile"
                    ? "text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t("tabProfile")}
              </button>
              <button
                onClick={() => setActiveTab("support")}
                className={`relative px-1.5 md:px-3 lg:px-4 py-0.5 md:py-1 lg:py-1.5 rounded-full cursor-pointer whitespace-nowrap text-xs md:text-sm lg:text-lg transition-colors duration-300 ${
                  activeTab === "support"
                    ? "text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t("tabSupport")}
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`relative px-1.5 md:px-3 lg:px-4 py-0.5 md:py-1 lg:py-1.5 rounded-full cursor-pointer whitespace-nowrap text-xs md:text-sm lg:text-lg transition-colors duration-300 ${
                  activeTab === "history"
                    ? "text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t("tabHistory")}
              </button>
              <button
                onClick={() => setActiveTab("cards")}
                className={`relative px-1.5 md:px-3 lg:px-4 py-0.5 md:py-1 lg:py-1.5 rounded-full cursor-pointer whitespace-nowrap text-xs md:text-sm lg:text-lg transition-colors duration-300 ${
                  activeTab === "cards"
                    ? "text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {t("tabCards")}
              </button>
            </div>

            {/* Tab Content */}
            <div
              className={`flex-1 flex flex-col pb-6 min-h-0 overflow-y-auto ${activeTab === "support" || activeTab === "cards" ? "relative" : ""}`}
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="size-8 animate-spin text-even-shamrock" />
                  </div>
                }
              >
                {activeTab === "profile" && <ProfileTab onLogout={onLogout} />}
                {activeTab === "cards" && <CardsTab />}
                {activeTab === "history" && <HistoryTab />}
                {activeTab === "support" && (
                  <SupportTab
                    messages={supportMessages}
                    setMessages={setSupportMessages}
                    sessionId={supportSessionId}
                    setSessionId={setSupportSessionId}
                  />
                )}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
