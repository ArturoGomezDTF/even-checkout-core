"use client";

import { useTranslations } from "next-intl";
import { Restaurant } from "../../interfaces/restaurante";
import { useTable } from "../../context/TableContext";
import { ChevronLeft, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { useGuest } from "../../context/GuestContext";
import { apiService } from "../../utils/api";

interface ParticipantsHeaderProps {
  restaurant: Restaurant;
  tableNumber?: string;
  onBack: () => void;
}

interface UserImageData {
  imageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}

interface Participant {
  guest_name: string;
  user_id: string | null;
  guest_id: string | null;
}

// Clave de identidad estable de un participante — evita colisiones entre dos
// invitados que hayan escrito el mismo nombre (antes se deduplicaba por guest_name).
const participantKeyOf = (p: Participant) =>
  p.user_id || p.guest_id || `guest_name:${p.guest_name}`;

// Marcadores usados por even-crew para pedidos/pagos capturados por el mesero
// (guestName sin userId/guestId real) — nunca son comensales reales.
// "MESERO" puede venir con el nombre del mesero concatenado (p.ej.
// "MESERO - Juan", ver AddDishModal/OpenTableWithDishesModal/CashPaymentModal
// en even-crew) — por eso el chequeo es por prefijo, no por igualdad exacta.
const STAFF_GUEST_MARKERS = new Set(["MESERO", "EFECTIVO", "TERMINAL"]);
const isStaffGuestMarker = (guestName: string) =>
  !!guestName &&
  (STAFF_GUEST_MARKERS.has(guestName) || guestName.startsWith("MESERO"));

export default function ParticipantsHeader({
  restaurant,
  tableNumber,
  onBack,
}: ParticipantsHeaderProps) {
  const t = useTranslations("ParticipantsHeader");
  const { state } = useTable();
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [usersImages, setUsersImages] = useState<Record<string, UserImageData>>(
    {},
  );
  const { user, profile, isLoading } = useAuth();
  const { guestId, guestName: myGuestName } = useGuest();

  // Extraer user_ids únicos y memoizarlos
  const userIdsString = useMemo(() => {
    const userIds = new Set<string>();

    if (Array.isArray(state.activeUsers)) {
      state.activeUsers.forEach((u) => {
        if (u && u.user_id) userIds.add(u.user_id);
      });
    }

    if (Array.isArray(state.dishOrders)) {
      state.dishOrders.forEach((order) => {
        if (order && order.user_id) userIds.add(order.user_id);
      });
    }

    // Convertir a string ordenado para comparación estable
    return Array.from(userIds).sort().join(",");
  }, [state.activeUsers, state.dishOrders]);

  // Cargar imágenes de usuarios autenticados
  // IMPORTANTE: Esto funciona tanto para usuarios autenticados como invitados
  // Los invitados también pueden ver las fotos de usuarios autenticados en la mesa
  useEffect(() => {
    const loadUsersImages = async () => {
      if (!userIdsString) return;

      const userIdsArray = userIdsString.split(",").filter(Boolean);
      if (userIdsArray.length === 0) return;

      try {
        const response = await apiService.getUsersInfo(userIdsArray);

        if (response.success && response.data) {
          // El backend retorna { success: true, data: { userId: {...} } }
          // Pero la estructura real tiene doble data, así que usamos response.data directamente
          const usersData = (response.data as any).data || response.data;
          setUsersImages(usersData as Record<string, UserImageData>);
        }
      } catch (error) {
        console.error("❌ Error loading users images:", error);
      }
    };

    loadUsersImages();
  }, [userIdsString]);

  // Extraer participantes únicos con información completa, deduplicados por
  // identidad estable (user_id / guest_id / guest_name) en lugar de solo guest_name.
  const participantsMap = new Map<string, Participant>();

  // Agregar de activeUsers — un usuario logueado que se unió sin ordenar
  // (joinTableWithoutOrdering) tiene guest_name null a propósito (su
  // identidad va por user_id, ver TableContext.tsx resolveCurrentIdentity).
  // Filtrar solo por guest_name lo dejaba totalmente fuera de la lista antes
  // de que getDisplayName pudiera resolver su nombre real vía profile.
  if (Array.isArray(state.activeUsers)) {
    state.activeUsers.forEach((activeUser) => {
      if (
        activeUser &&
        (activeUser.user_id || activeUser.guest_id || activeUser.guest_name) &&
        !isStaffGuestMarker(activeUser.guest_name || "")
      ) {
        const participant: Participant = {
          guest_name: activeUser.guest_name || "",
          user_id: activeUser.user_id || null,
          guest_id: activeUser.guest_id || null,
        };
        participantsMap.set(participantKeyOf(participant), participant);
      }
    });
  }

  // Agregar de dishOrders (solo si no existe ya)
  // Los marcadores de even-crew (ver STAFF_GUEST_MARKERS) no son comensales
  // reales, no deben aparecer como participantes.
  if (Array.isArray(state.dishOrders)) {
    state.dishOrders.forEach((order) => {
      if (
        order &&
        order.guest_name &&
        !isStaffGuestMarker(order.guest_name)
      ) {
        const participant: Participant = {
          guest_name: order.guest_name,
          user_id: order.user_id || null,
          guest_id: order.guest_id || null,
        };
        const key = participantKeyOf(participant);
        if (!participantsMap.has(key)) {
          participantsMap.set(key, participant);
        }
      }
    });
  }

  const participants = Array.from(participantsMap.values());
  const visibleParticipants = participants.slice(0, 2);
  const remainingCount = participants.length - 2;

  // Verificar si un participante es la sesión actual — autenticada o invitada.
  const isCurrentUser = (participant: Participant) => {
    if (user) return participant.user_id === user.id;
    if (guestId) return participant.guest_id === guestId;
    if (myGuestName) return participant.guest_name === myGuestName;
    return false;
  };

  // Obtener el nombre a mostrar (nombre real si es usuario autenticado, o guest_name)
  const getDisplayName = (participant: Participant) => {
    // Si es el usuario actual, usar datos de profile directamente
    if (isCurrentUser(participant) && profile) {
      return profile.firstName && profile.lastName
        ? `${profile.firstName} ${profile.lastName}`
        : profile.firstName || participant.guest_name;
    }

    // Si tiene user_id y tenemos sus datos cargados, usar el nombre real
    if (participant.user_id && usersImages[participant.user_id]) {
      const userData = usersImages[participant.user_id];
      return userData.fullName || userData.firstName || participant.guest_name;
    }

    // Si no, usar guest_name (con fallback si vino vacío — mismo criterio
    // que EqualSplitSelectionModal.tsx)
    return participant.guest_name || t("defaultGuestName");
  };

  // Obtener imagen de usuario (para usuarios que no son el actual)
  const getUserImage = (participant: Participant) => {
    if (participant.user_id && usersImages[participant.user_id]) {
      return usersImages[participant.user_id].imageUrl;
    }
    return null;
  };

  // Generar inicial
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // Generar colos segun el nombre (siempre el mismo color para ese nombre)
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
      "bg-emerald-500",
      "bg-violet-500",
      "bg-rose-500",
      "bg-lime-500",
      "bg-amber-500",
      "bg-sky-500",
      "bg-fuchsia-500",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <header className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 z-10">
      <div className="relative flex items-center justify-between z-10">
        {/* Back */}
        <div className="flex items-center z-10">
          <div
            onClick={onBack}
            className="size-10 md:size-12 lg:size-14 bg-white border border-gray-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200 active:scale-95 transition-transform duration-200"
          >
            <ChevronLeft className="text-primary size-5 md:size-6 lg:size-7" />
          </div>
        </div>

        {/* Even Logo */}
        <div className="absolute left-1/2 transform -translate-x-1/2 size-10 md:size-12 lg:size-14">
          <img src="/even/even-asterisk-grass.svg" alt="Even" />
        </div>

        {/* Participantes */}
        {isLoading ? (
          // Loading
          <div className="flex items-center space-x-1">
            <div className="size-10 md:size-12 lg:size-14 bg-gray-300 animate-pulse rounded-full border border-white shadow-sm"></div>
          </div>
        ) : participants.length > 0 ? (
          <div className="flex items-center space-x-1">
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
                  key={participantKeyOf(participant)}
                  onClick={() => setIsParticipantsModalOpen(true)}
                  className={`size-10 md:size-12 lg:size-14 rounded-full flex items-center justify-center text-white text-base md:text-lg lg:text-xl font-medium border border-white shadow-sm cursor-pointer overflow-hidden ${!hasImage ? getAvatarColor(displayName) : ""}`}
                  style={{
                    marginLeft: remainingCount > 0 || index > 0 ? "-12px" : "0",
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

        {/* Cart and order buttons - Available if needed */}
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
            <div className="px-6 md:px-8 lg:px-10 py-4 md:py-5 lg:py-6 space-y-3 md:space-y-4 lg:space-y-5 max-h-80 md:max-h-96 lg:max-h-[28rem] overflow-y-auto">
              {participants.map((participant) => {
                const isCurrent = isCurrentUser(participant);
                const displayName = getDisplayName(participant);
                const userImage =
                  isCurrent && profile?.photoUrl
                    ? profile.photoUrl
                    : getUserImage(participant);
                const hasImage = !!userImage;
                const activeUser = Array.isArray(state.activeUsers)
                  ? state.activeUsers.find(
                      (u) =>
                        u &&
                        participantKeyOf({
                          guest_name: u.guest_name,
                          user_id: u.user_id || null,
                          guest_id: u.guest_id || null,
                        }) === participantKeyOf(participant),
                    )
                  : null;

                return (
                  <div
                    key={participantKeyOf(participant)}
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
                          <span className="ml-2 text-xs md:text-sm lg:text-base text-primary">
                            {t("youMarker")}
                          </span>
                        )}
                      </p>
                      <p className="text-sm md:text-base lg:text-lg text-stroke">
                        {(() => {
                          // Matchear por user_id/guest_id (mismo orden de
                          // prioridad que participantKeyOf), no por
                          // guest_name — dish_order.guest_name siempre viene
                          // resuelto, pero participant.guest_name puede venir
                          // vacío si su fila de active_table_users aún no
                          // tenía nombre (ver TableContext.tsx
                          // joinTableWithoutOrdering), y comparar por string
                          // dejaba a esa persona sin sus platillos aunque sí
                          // hubiera ordenado.
                          const userOrders = Array.isArray(state.dishOrders)
                            ? state.dishOrders.filter((order) => {
                                if (!order) return false;
                                if (participant.user_id) {
                                  return order.user_id === participant.user_id;
                                }
                                if (participant.guest_id) {
                                  return order.guest_id === participant.guest_id;
                                }
                                return order.guest_name === participant.guest_name;
                              })
                            : [];

                          const dishCount = userOrders.length;
                          const totalValue = userOrders.reduce(
                            (sum, order) =>
                              sum +
                              (order?.total_display_price ??
                                order?.total_price ??
                                0),
                            0,
                          );

                          if (dishCount === 0 && activeUser) {
                            return t("activeAtTable");
                          }

                          return `$${totalValue.toFixed(2)}`;
                        })()}
                      </p>
                      {(() => {
                        const paidAmount =
                          (activeUser?.total_paid_individual || 0) +
                          (activeUser?.total_paid_amount || 0);
                        if (paidAmount <= 0) return null;
                        return (
                          <p className="text-sm md:text-base lg:text-lg text-even-shamrock font-medium">
                            {t("paidLabel", { amount: paidAmount.toFixed(2) })}
                          </p>
                        );
                      })()}
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
