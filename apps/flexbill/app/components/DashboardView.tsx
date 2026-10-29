"use client";

import { useTranslations } from "next-intl";
import { useState, lazy, Suspense } from "react";
import ProfileTab from "./dashboard/ProfileTab";
import DashboardHeader from "./headers/DashboardHeader";
import { useAuth } from "../context/AuthContext";
import { Loader2 } from "lucide-react";

const CardsTab = lazy(() => import("./dashboard/CardsTab"));
const HistoryTab = lazy(() => import("./dashboard/HistoryTab"));
const SupportTab = lazy(() => import("./dashboard/SupportTab"));

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

  // States for Support Tab (Pepper chat)
  const [supportMessages, setSupportMessages] = useState<
    Array<{ role: "user" | "pepper"; content: string }>
  >([]);
  const [supportSessionId, setSupportSessionId] = useState<string | null>(null);

  const { user, profile, isLoading } = useAuth();
  const isAuthenticated = !!user;

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center ${onClose ? "h-full" : "h-dvh brand-evergreen"}`}
      >
        <Loader2 className="size-12 animate-spin text-even-shamrock" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        className={`flex items-center justify-center ${onClose ? "h-full" : "h-dvh brand-evergreen"}`}
      >
        <p
          className={`text-base md:text-lg ${onClose ? "text-black/60" : "text-white/60"}`}
        >
          {t("loginToViewProfile")}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-y-auto ${onClose ? "h-full" : "h-dvh brand-evergreen"}`}
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

        <div className="flex-1 flex flex-col">
          <div className="bg-white rounded-t-4xl flex-1 z-5 flex flex-col px-6 md:px-7 lg:px-8 min-h-0">
            {/* Tabs */}
            <div className="relative grid grid-cols-4 gap-2 my-6 md:my-7 lg:my-8 w-full">
              {/* Animated Background Indicator */}
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
              className={`flex-1 flex flex-col overflow-y-auto pb-6 min-h-0 ${activeTab === "support" || activeTab === "cards" ? "relative" : ""}`}
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-12 md:py-16 lg:py-20">
                    <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-even-shamrock" />
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
