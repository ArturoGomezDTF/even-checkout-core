"use client";

import { useTable } from "@/app/context/TableContext";
import { useTableNavigation } from "@/app/hooks/useTableNavigation";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { Restaurant } from "@/app/types/restaurant";
import { useModalBackClose } from "@/app/hooks/useModalBackClose";
import { useTranslations } from "next-intl";

const LanguageToggleButton = lazy(() => import("../UI/LanguageToggleButton"));

interface MenuHeaderProps {
  restaurant?: Restaurant;
  tableNumber?: string;
  showBackButton?: boolean;
}

interface UserImageData {
  imageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}

export default function MenuHeader({
  restaurant,
  tableNumber,
  showBackButton = true,
}: MenuHeaderProps) {
  const t = useTranslations("MenuHeader");
  const router = useRouter();
  const { state } = useTable();
  const { navigateWithTable } = useTableNavigation();
  const pathname = usePathname();
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [usersImages, setUsersImages] = useState<Record<string, UserImageData>>(
    {},
  );
  const { user, profile, isLoading } = useAuth();
  const [participantsKey, setParticipantsKey] = useState(0);

  // Forzar actualización cuando cambian los activeUsers
  useEffect(() => {
    setParticipantsKey((prev) => prev + 1);
  }, [state.activeUsers, state.activeUsers?.length]);

  // El back gesto/botón del dispositivo cierra este modal en vez de salir
  // de la página.
  useModalBackClose(isParticipantsModalOpen, () =>
    setIsParticipantsModalOpen(false),
  );

  const handleBack = () => {
    if (pathname?.includes("payment-options")) {
      navigateWithTable("/order");
    } else {
      router.back();
    }
  };

  // Extraer participantes únicos de activeUsers
  // En Tap & Pay, los participantes vienen de active_table_users
  const participantsMap = new Map<
    string,
    { guest_name: string; user_id: string | null }
  >();

  // Agregar de activeUsers (principal fuente de participantes)
  if (Array.isArray(state.activeUsers)) {
    state.activeUsers.forEach((activeUser) => {
      const identifier = activeUser.user_id || activeUser.guest_name;
      if (identifier && !participantsMap.has(identifier)) {
        participantsMap.set(identifier, {
          guest_name: activeUser.guest_name || "Usuario",
          user_id: activeUser.user_id || null,
        });
      }
    });
  }

  const participants = Array.from(participantsMap.values());
  const visibleParticipants = participants.slice(0, 2);
  const remainingCount = participants.length - 2;

  // Verificar si un participante es el usuario actual autenticado
  const isCurrentUser = (participant: {
    guest_name: string;
    user_id: string | null;
  }) => {
    return user && participant.user_id === user.id;
  };

  // Obtener el nombre a mostrar
  const getDisplayName = (participant: {
    guest_name: string;
    user_id: string | null;
  }) => {
    if (isCurrentUser(participant) && profile) {
      return profile.firstName && profile.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : profile.firstName || participant.guest_name;
    }

    if (participant.user_id && usersImages[participant.user_id]) {
      const userData = usersImages[participant.user_id];
      return userData.fullName || userData.firstName || participant.guest_name;
    }

    return participant.guest_name;
  };

  // Obtener imagen de usuario
  const getUserImage = (participant: {
    guest_name: string;
    user_id: string | null;
  }) => {
    if (participant.user_id && usersImages[participant.user_id]) {
      return usersImages[participant.user_id].imageUrl;
    }
    return null;
  };

  // Generar inicial
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // Generar color según el nombre
  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-red-500",
      "bg-yellow-500",
      "bg-teal-500",
      "bg-orange-500",
      "bg-cyan-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <header
      className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 relative"
      style={{ zIndex: 100 }}
    >
      <div className="relative flex items-center justify-between z-10">
        {/* Back */}
        <div className="flex items-center z-10">
          {showBackButton ? (
            <div
              onClick={handleBack}
              className="size-10 md:size-12 lg:size-14 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 active:scale-95 transition-transform duration-200"
            >
              <ChevronLeft className="text-primary size-5 md:size-6 lg:size-7" />
            </div>
          ) : (
            <div className="size-10 md:size-12 lg:size-14" />
          )}
        </div>

        {/* Even Logo */}
        <div className="absolute left-1/2 transform -translate-x-1/2 size-10 md:size-12 lg:size-14">
          <img src="/even/even-asterisk-grass.svg" alt="Even" />
        </div>

        {/* Idioma + Participantes */}
        <div className="flex items-center gap-2 md:gap-3 z-10">
          <Suspense fallback={null}>
            <LanguageToggleButton />
          </Suspense>

          {isLoading ? (
            <div className="flex items-center space-x-1">
              <div className="size-10 md:size-12 lg:size-14 bg-gray-300 animate-pulse rounded-full border border-white shadow-sm"></div>
            </div>
          ) : participants.length > 0 ? (
            <div key={participantsKey} className="flex items-center space-x-1">
              {remainingCount > 0 && (
                <div
                  onClick={() => setIsParticipantsModalOpen(true)}
                  className="size-10 md:size-12 lg:size-14 bg-white rounded-full flex items-center justify-center text-black text-base md:text-lg lg:text-xl font-medium border border-stroke shadow-sm cursor-pointer"
                >
                  +{remainingCount}
                </div>
              )}
              {visibleParticipants.map((participant, index) => {
                const isCurrent = isCurrentUser(participant);
                const displayName = getDisplayName(participant);
                const userImage =
                  isCurrent && profile?.photoUrl
                    ? profile.photoUrl
                    : getUserImage(participant);
                const hasImage = !!userImage;

                return (
                  <div
                    key={participant.guest_name}
                    onClick={() => setIsParticipantsModalOpen(true)}
                    className={`size-10 md:size-12 lg:size-14 rounded-full flex items-center justify-center text-white text-base md:text-lg lg:text-xl font-medium border border-white shadow-sm cursor-pointer overflow-hidden ${!hasImage ? getAvatarColor(displayName) : ""}`}
                    style={{
                      marginLeft:
                        remainingCount > 0 || index > 0 ? "-12px" : "0",
                    }}
                  >
                    {hasImage ? (
                      <img
                        src={userImage}
                        alt={displayName}
                        className="size-10 md:size-12 lg:size-14 rounded-full object-cover"
                      />
                    ) : (
                      getInitials(displayName)
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal participantes */}
      {isParticipantsModalOpen && (
        <div
          className="fixed inset-0 flex items-end justify-center z-9999"
          style={{ zIndex: 99999 }}
        >
          {/* Fondo */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsParticipantsModalOpen(false)}
          ></div>

          {/* Modal */}
          <div className="relative bg-white rounded-t-4xl w-full mx-4 md:mx-6 lg:mx-8">
            {/* Titulo */}
            <div className="px-6 md:px-8 lg:px-10 pt-4 md:pt-5 lg:pt-6">
              <div className="flex items-center justify-between pb-4 md:pb-5 border-b border-stroke">
                <h3 className="text-lg md:text-xl lg:text-2xl font-semibold text-black">
                  {t("participantsTitle")}
                </h3>
                <button
                  onClick={() => setIsParticipantsModalOpen(false)}
                  className="p-1 md:p-1.5 lg:p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
                >
                  <X className="size-5 md:size-6 lg:size-7 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Lista de participantes */}
            <div className="px-6 md:px-8 lg:px-10 py-4 md:py-5 lg:py-6 space-y-3 md:space-y-4 lg:space-y-5 max-h-80 md:max-h-96 lg:max-h-112 overflow-y-auto">
              {participants.map((participant) => {
                const isCurrent = isCurrentUser(participant);
                const displayName = getDisplayName(participant);
                const userImage =
                  isCurrent && profile?.photoUrl
                    ? profile.photoUrl
                    : getUserImage(participant);
                const hasImage = !!userImage;

                return (
                  <div
                    key={participant.guest_name}
                    className="flex items-center gap-3 md:gap-4"
                  >
                    <div
                      className={`size-12 md:size-14 lg:size-16 rounded-full flex items-center justify-center text-white text-base md:text-lg lg:text-xl font-semibold overflow-hidden ${!hasImage ? getAvatarColor(displayName) : ""}`}
                    >
                      {hasImage ? (
                        <img
                          src={userImage}
                          alt={displayName}
                          className="size-12 md:size-14 lg:size-16 rounded-full object-cover"
                        />
                      ) : (
                        getInitials(displayName)
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-black text-base md:text-lg lg:text-xl">
                        {displayName}
                        {isCurrent && (
                          <span className="ml-2 text-xs md:text-sm lg:text-base text-even-grass">
                            {t("youIndicator")}
                          </span>
                        )}
                      </p>
                      <p className="text-sm md:text-base lg:text-lg text-stroke">
                        {(() => {
                          // Buscar el usuario activo para obtener su amount_paid
                          const activeUser = Array.isArray(state.activeUsers)
                            ? state.activeUsers.find(
                                (u) =>
                                  (participant.user_id &&
                                    u.user_id === participant.user_id) ||
                                  u.guest_name === participant.guest_name,
                              )
                            : null;

                          if (activeUser && activeUser.amount_paid > 0) {
                            return t("paidAmount", {
                              amount: activeUser.amount_paid.toFixed(2),
                            });
                          }

                          if (activeUser) {
                            return t("activeUserNoPayment");
                          }

                          return t("noParticipation");
                        })()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
