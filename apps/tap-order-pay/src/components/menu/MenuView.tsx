"use client";

import {
  lazy,
  Suspense,
  useState,
  useMemo,
  useEffect,
  useRef,
  useTransition,
  useDeferredValue,
} from "react";
import { useTranslations } from "next-intl";
import { lockScroll, unlockScroll } from "@/utils/scrollLock";
import MenuHeader from "../headers/MenuHeader";
import MenuCategory from "./MenuCategory";
import {
  Search,
  ShoppingCart,
  UserCircle,
  X,
  RefreshCw,
  Utensils,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useUserData } from "../../context/userDataContext";
import { useTableNavigation } from "../../hooks/useTableNavigation";
import { useModalBackClose } from "../../hooks/useModalBackClose";
import { useCart } from "../../context/CartContext";
import { useRestaurant } from "../../context/RestaurantContext";
import Loader from "../UI/Loader";
import PepperIcon from "../UI/PepperIcon";
import { useAuth } from "@/context/AuthContext";
import { useGuest } from "@/context/GuestContext";
import {
  tapOrderService,
  type ActiveOrder,
  type LastOrderDish,
} from "@/services/taporders.service";
import { getItemDisplayPrice } from "@/utils/commissionCalculator";

const ChatView = lazy(() => import("../ChatView"));
const AuthView = lazy(() => import("../AuthView"));
const DashboardView = lazy(() => import("../DashboardView"));
const RestaurantClosedModal = lazy(() => import("../RestaurantClosedModal"));
const ReorderModal = lazy(() => import("../modals/ReorderModal"));

// Pure functions — defined outside to avoid re-creation on every render
function getStatusColor(status: string) {
  switch (status) {
    case "preparing":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "ready":
      return "bg-orange-100 text-orange-800 border-orange-300";
    case "delivered":
      return "bg-green-100 text-green-800 border-green-300";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

interface UserAvatarProps {
  isAuthenticated: boolean;
  profile: { photoUrl?: string; firstName?: string } | null;
  iconSize?: string;
  textSize?: string;
}

function UserAvatar({
  isAuthenticated,
  profile,
  iconSize = "size-6 md:size-7 lg:size-8",
  textSize = "text-base md:text-lg lg:text-xl",
}: UserAvatarProps) {
  const t = useTranslations("MenuView");

  if (isAuthenticated && profile?.photoUrl) {
    return (
      <img
        src={profile.photoUrl}
        alt={t("profileAlt")}
        className="w-full h-full object-cover"
      />
    );
  }
  if (isAuthenticated && profile?.firstName) {
    return (
      <span className={`text-stone-800 font-semibold select-none ${textSize}`}>
        {profile.firstName.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <UserCircle className={`text-stone-500 ${iconSize}`} strokeWidth={1.2} />
  );
}

interface MenuViewProps {
  tableNumber?: string;
}

export default function MenuView({ tableNumber }: MenuViewProps) {
  const t = useTranslations("MenuView");
  const tc = useTranslations("Common");
  const [filter, setFilter] = useState("Todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [, startTransition] = useTransition();
  const { user, profile, isAuthenticated, logout } = useAuth();
  const { guestId } = useGuest();
  const { signUpData } = useUserData();
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [activeOrderIndex, setActiveOrderIndex] = useState(0);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLastOrder, setHasLastOrder] = useState(false);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [lastOrderItems, setLastOrderItems] = useState<LastOrderDish[]>([]);
  const [showPepperChat, setShowPepperChat] = useState(false);
  const [isPepperClosing, setIsPepperClosing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSettingsClosing, setIsSettingsClosing] = useState(false);
  const [dashboardInitialTab, setDashboardInitialTab] = useState<
    "profile" | "cards" | "history" | "support"
  >("profile");
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const stickyTriggerRef = useRef<HTMLDivElement>(null);
  const { navigateWithTable } = useTableNavigation();
  const { state: cartState, refreshCart, addItem } = useCart();
  const { restaurant, restaurantId, menu, loading, error } = useRestaurant();

  const getStatusText = (status: string) => {
    switch (status) {
      case "preparing":
        return tc("statusPreparing");
      case "ready":
        return tc("statusReady");
      case "delivered":
        return tc("statusDelivered");
      default:
        return status;
    }
  };

  const closeSettingsModal = () => {
    setIsSettingsClosing(true);
    setTimeout(() => {
      setShowSettingsModal(false);
      setIsSettingsClosing(false);
      setDashboardInitialTab("profile");
    }, 380);
  };

  // Abrir el dashboard en la pestaña de tarjetas cuando se regresa de agregar
  // una tarjeta (?dashboard=cards). Se limpia el parámetro para que un refresh
  // o reapertura del modal no lo vuelva a disparar.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("dashboard") === "cards") {
      setDashboardInitialTab("cards");
      setShowSettingsModal(true);
      url.searchParams.delete("dashboard");
      window.history.replaceState({}, "", url);
    }
  }, []);

  // Con Pepper Chat o el modal de Settings abiertos (Chat/Auth/Dashboard),
  // el body pasa a #F1F1F1 para que el overscroll bounce de iOS combine
  // con el gris de esos paneles en vez del blanco de la pantalla base.
  // No capturamos "previous" del DOM: el effect de arriba ya lo dejó en
  // "#ffffff", así que ese es el valor correcto al que hay que volver.
  useEffect(() => {
    const modalOpen = showPepperChat || showSettingsModal;
    document.body.style.backgroundColor = modalOpen ? "#F1F1F1" : "#fefeeb";
    return () => {
      document.body.style.backgroundColor = "#fefeeb";
    };
  }, [showPepperChat, showSettingsModal]);

  // Logout desde el modal: primero cerrar con animación, luego limpiar la
  // sesión. Si se limpia antes, el modal re-renderiza su contenido como
  // AuthView/"Acceso denegado" durante la animación y se ve un flash.
  const handleSettingsLogout = () => {
    setIsSettingsClosing(true);
    setTimeout(() => {
      setShowSettingsModal(false);
      setIsSettingsClosing(false);
      logout();
    }, 380);
  };

  useEffect(() => {
    if (showPepperChat) {
      lockScroll();
      return unlockScroll;
    }
  }, [showPepperChat]);
  useEffect(() => {
    if (showSettingsModal) {
      lockScroll();
      return unlockScroll;
    }
  }, [showSettingsModal]);
  useEffect(() => {
    if (isStatusModalOpen) {
      lockScroll();
      return unlockScroll;
    }
  }, [isStatusModalOpen]);
  useEffect(() => {
    if (showReorderModal) {
      lockScroll();
      return unlockScroll;
    }
  }, [showReorderModal]);

  // Precargar chunks lazy después de que la página ya es interactiva
  useEffect(() => {
    const t = setTimeout(() => {
      import("../ChatView");
      import("../AuthView");
      import("../DashboardView");
      import("../RestaurantClosedModal");
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // Mostrar barra sticky al hacer scroll past el trigger
  useEffect(() => {
    const trigger = stickyTriggerRef.current;
    if (!trigger) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, []);

  // Verificar si hay pedidos activos — devuelve el array (o vacío) sin tocar estado
  const checkActiveOrder = async (): Promise<ActiveOrder[]> => {
    const clientId = user?.id || guestId;
    if (!clientId || !restaurantId) return [];
    try {
      const response = (await tapOrderService.getActiveOrderByUser(
        clientId,
        restaurantId,
      )) as any;
      return response.success && response.hasActiveOrder
        ? (response.orders ?? [])
        : [];
    } catch (error) {
      console.error("Error checking active order:", error);
      return [];
    }
  };

  // Verificar último pedido — devuelve los platillos reordenables
  const checkLastOrderItems = async (): Promise<LastOrderDish[]> => {
    const clientId = user?.id || guestId;
    if (!clientId || !restaurantId) return [];
    try {
      const response = await tapOrderService.getLastOrderByUser(
        clientId,
        restaurantId,
      );
      return response.success && (response as any).hasLastOrder
        ? ((response as any)?.data?.dishes ?? []).filter(
            (d: LastOrderDish) => d.menu_item_id,
          )
        : [];
    } catch (error) {
      console.error("Error checking last order:", error);
      return [];
    }
  };

  // Cargar ambos en paralelo y setear el estado junto, para que los botones de
  // "Estatus de pedido" y "Reordenar" aparezcan exactamente al mismo tiempo.
  // #97: se difiere a que el navegador esté ocioso para no competir con la carga del menú.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [orders, dishes] = await Promise.all([
        checkActiveOrder(),
        checkLastOrderItems(),
      ]);
      if (cancelled) return;
      setActiveOrders(orders);
      setActiveOrderIndex((prev) => (prev < orders.length ? prev : 0));
      setLastOrderItems(dishes);
      setHasLastOrder(dishes.length > 0);
    };

    // Safari no tiene requestIdleCallback.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const handle = hasIdle
      ? window.requestIdleCallback(load, { timeout: 2000 })
      : window.setTimeout(load, 1500);

    return () => {
      cancelled = true;
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, guestId, restaurantId]);

  const activeOrder = activeOrders[activeOrderIndex] ?? null;

  const handleReorder = () => setShowReorderModal(true);

  const handleRefreshOrder = async () => {
    setIsRefreshing(true);
    const orders = await checkActiveOrder();
    setActiveOrders(orders);
    setActiveOrderIndex((prev) => (prev < orders.length ? prev : 0));
    setIsRefreshing(false);
  };

  // Obtener categorías únicas del menú ordenadas por display_order
  const categorias = useMemo(() => {
    const categories = ["Todo"];
    if (menu && menu.length > 0) {
      const sortedSections = [...menu].sort(
        (a, b) => a.display_order - b.display_order,
      );
      sortedSections.forEach((section) => {
        if (section.name) categories.push(section.name);
      });
    }
    return categories;
  }, [menu]);

  const gender = signUpData?.gender;

  const totalItems = cartState.totalItems;

  const closePepperChat = () => {
    setIsPepperClosing(true);
    refreshCart();
    setTimeout(() => {
      setShowPepperChat(false);
      setIsPepperClosing(false);
    }, 380);
  };

  // El back gesto/botón del dispositivo cierra estos modales en vez de
  // salir de la página (misma animación que cerrar con la X/backdrop).
  useModalBackClose(showPepperChat, () => closePepperChat());
  useModalBackClose(showSettingsModal, () => closeSettingsModal());

  const deferredFilter = useDeferredValue(filter);
  const deferredSearch = useDeferredValue(searchQuery);

  // Filtrar menú usando valores diferidos — el render pesado ocurre en baja prioridad
  const filteredMenu = useMemo(() => {
    let filtered = menu;

    if (deferredFilter !== "Todo") {
      filtered = filtered.filter((section) => section.name === deferredFilter);
    }

    if (deferredSearch.trim()) {
      const query = deferredSearch.toLowerCase().trim();
      filtered = filtered
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              item.name.toLowerCase().includes(query) ||
              item.description?.toLowerCase().includes(query),
          ),
        }))
        .filter((section) => section.items.length > 0);
    }

    return [...filtered].sort((a, b) => a.display_order - b.display_order);
  }, [menu, deferredFilter, deferredSearch]);

  if (loading && !restaurant) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="min-h-screen brand-evergreen flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {tc("errorTitle")}
          </h1>
          <p className="text-white">{error}</p>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen brand-evergreen flex items-center justify-center">
        <div className="text-center px-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            {t("restaurantNotFound")}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white relative">
      {restaurant.banner_url ? (
        <img
          src={restaurant.banner_url}
          alt=""
          fetchPriority="high"
          className="absolute top-0 left-0 w-full h-57.5 md:h-96 lg:h-112 object-cover banner-mobile z-0"
        />
      ) : (
        <div className="absolute top-0 left-0 w-full h-57.5 md:h-96 lg:h-112 bg-even-evergreen banner-mobile z-0" />
      )}

      <MenuHeader restaurant={restaurant} tableNumber={tableNumber} />

      <main className="mt-36 md:mt-64 lg:mt-80 relative z-10">
        <div className="bg-white rounded-t-4xl flex flex-col items-center px-6 md:px-8 lg:px-10">
          {/* Trigger invisible para IntersectionObserver */}
          <div
            ref={stickyTriggerRef}
            className="absolute top-0 h-px w-px pointer-events-none"
          />

          <div className="mt-6 md:mt-8 flex items-start justify-between w-full">
            {/* Settings Icon */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="bg-white rounded-full shadow-sm hover:bg-gray-50 transition-all active:scale-95 size-9 md:size-10 lg:size-12 overflow-hidden flex items-center justify-center"
            >
              <UserAvatar isAuthenticated={isAuthenticated} profile={profile} />
            </button>

            {/* Assistant Icon */}
            <button
              onClick={() => setShowPepperChat(true)}
              className="size-14 md:size-16 lg:size-18 overflow-hidden transition-all active:scale-95 -mt-2 md:-mt-3"
            >
              <PepperIcon />
            </button>
          </div>

          {/* Name and photo */}
          <div className="mb-4 md:mb-6 flex flex-col items-center">
            <div className="size-28 md:size-36 lg:size-40 rounded-full bg-even-evergreen overflow-hidden border border-gray-400 shadow-sm">
              {restaurant.logo_url && (
                <img
                  src={restaurant.logo_url}
                  alt={tc("restaurantLogoAlt")}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <h1 className="text-black text-3xl md:text-4xl lg:text-5xl font-medium mt-3 md:mt-5">
              {t("welcome", {
                gender: gender === "female" ? "female" : "other",
                name: profile?.firstName ? ` ${profile.firstName}` : "",
              })}
            </h1>
            <h3 className="mt-1 mb-3 text-black/70 text-xl md:text-2xl lg:text-3xl">
              {tc("tableLabel", { table: tableNumber ?? "" })}
            </h3>

            {/* Link to active order status + reorder */}
            <div className="flex flex-wrap gap-2 justify-center">
              {activeOrders.length > 0 && (
                <button
                  onClick={() =>
                    setTimeout(() => setIsStatusModalOpen(true), 400)
                  }
                  className="bg-surface border border-stroke rounded-full px-3 md:px-4 lg:px-5 py-1 md:py-1.5 text-sm md:text-lg lg:text-xl font-medium text-black w-fit active:scale-90 transition-all"
                >
                  {activeOrders.length > 1 ? t("viewOrders") : t("orderStatus")}
                </button>
              )}
              {hasLastOrder && (
                <button
                  onClick={handleReorder}
                  className="bg-even-grass text-even-evergreen border border-stroke rounded-full px-3 md:px-4 lg:px-5 py-1 md:py-1.5 text-sm md:text-lg lg:text-xl font-medium w-fit active:scale-90 transition-all flex items-center gap-1.5"
                >
                  {tc("reorderCta")}
                  <RefreshCw className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Search Input */}
          <div className="w-full">
            <div className="flex items-center justify-center border-b border-black">
              <Search
                className="text-black size-5 md:size-6 lg:size-7"
                strokeWidth={1}
              />
              <input
                type="text"
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-black text-base md:text-lg lg:text-xl px-3 md:px-4 py-2 md:py-3 focus:outline-none"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-2 md:gap-3 mt-3 md:mt-5 mb-3 md:mb-5 w-full overflow-x-auto scrollbar-hide">
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => startTransition(() => setFilter(cat))}
                className={`px-3 md:px-5 lg:px-6 py-1 md:py-2 text-sm md:text-base lg:text-lg rounded-full whitespace-nowrap shrink-0
                ${
                  filter === cat
                    ? "bg-black text-white hover:bg-slate-800"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Items */}
          {filteredMenu.length > 0 ? (
            filteredMenu.map((section) => (
              <MenuCategory
                key={section.id}
                section={section}
                showSectionName={deferredFilter === "Todo"}
                onRestaurantClosed={() => setShowClosedModal(true)}
              />
            ))
          ) : (
            <div className="text-center py-10 md:py-16">
              <p className="text-gray-500 text-base md:text-lg lg:text-xl">
                {searchQuery.trim()
                  ? t("noResultsFor", { query: searchQuery })
                  : t("noItemsAvailable")}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Carrito flotante */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 md:bottom-8 lg:bottom-10 left-0 right-0 z-50 flex justify-center">
          <button
            onClick={() => navigateWithTable("/cart")}
            className="bg-even-grass text-even-evergreen rounded-full px-6 md:px-8 lg:px-10 py-4 md:py-5 lg:py-6 shadow-lg flex items-center gap-3 md:gap-4 cursor-pointer transition-all hover:scale-105 animate-bounce-in active:scale-90"
          >
            <ShoppingCart className="size-5 md:size-6 lg:size-7" />
            <span className="text-base md:text-lg lg:text-xl font-medium">
              {t("viewCart", { count: totalItems })}
            </span>
          </button>
        </div>
      )}

      {/* Sticky Bar — aparece al hacer scroll down */}
      <div
        className="fixed top-0 inset-x-0 z-40 flex justify-center px-4 pt-4 pb-3"
        style={{
          opacity: showStickyBar ? 1 : 0,
          transition: "opacity 120ms ease",
          pointerEvents: showStickyBar ? "auto" : "none",
        }}
      >
        <div
          className="flex items-center gap-4 md:gap-5 rounded-full px-6 md:px-7 py-3 md:py-3.5 shadow-lg border border-white/40"
          style={{
            background: "rgba(255, 255, 255, 0.82)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          {/* Settings */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="size-11 md:size-12 rounded-full overflow-hidden flex items-center justify-center bg-white/60 border border-gray-200 hover:bg-white transition-colors active:scale-95"
          >
            <UserAvatar
              isAuthenticated={isAuthenticated}
              profile={profile}
              iconSize="size-6 md:size-7"
              textSize="text-base md:text-lg"
            />
          </button>

          {/* Carrito */}
          <div className="relative">
            <button
              onClick={() => navigateWithTable("/cart")}
              className="size-11 md:size-12 rounded-full flex items-center justify-center bg-white/60 border border-gray-200 hover:bg-white transition-colors active:scale-95"
            >
              <ShoppingCart
                className="size-5 md:size-6 text-stone-700"
                strokeWidth={1.5}
              />
            </button>
            {totalItems > 0 && (
              <div className="absolute -top-1 -right-1 bg-even-grass text-even-evergreen rounded-full size-5 flex items-center justify-center text-xs font-normal">
                {totalItems}
              </div>
            )}
          </div>

          {/* Pepper */}
          <button
            onClick={() => setShowPepperChat(true)}
            className="size-12 md:size-14 overflow-hidden transition-colors active:scale-95"
          >
            <PepperIcon />
          </button>
        </div>
      </div>

      {/* Status Modal */}
      {isStatusModalOpen && activeOrder && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-999 flex items-center justify-center"
          onClick={() => setIsStatusModalOpen(false)}
        >
          <div
            className="relative bg-even-evergreen/80 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] w-full mx-4 md:mx-12 lg:mx-28 rounded-4xl z-999 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {activeOrders.length > 1 && (
              <>
                <button
                  onClick={() => setActiveOrderIndex((i) => i - 1)}
                  disabled={activeOrderIndex === 0}
                  className="absolute left-3 md:left-4 top-[30%] z-10 rounded-full size-9 md:size-10 flex items-center justify-center bg-white/10 border border-white/25 hover:bg-white/20 transition-colors active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronLeft className="size-6 md:size-7 text-white" />
                </button>
                <button
                  onClick={() => setActiveOrderIndex((i) => i + 1)}
                  disabled={activeOrderIndex === activeOrders.length - 1}
                  className="absolute right-3 md:right-4 top-[30%] z-10 rounded-full size-9 md:size-10 flex items-center justify-center bg-white/10 border border-white/25 hover:bg-white/20 transition-colors active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                >
                  <ChevronRight className="size-6 md:size-7 text-white" />
                </button>
              </>
            )}
            {/* Header */}
            <div className="shrink-0">
              <div className="w-full flex justify-end">
                <button
                  onClick={() => setIsStatusModalOpen(false)}
                  className="p-2 md:p-3 lg:p-4 hover:bg-white/10 rounded-lg md:rounded-xl transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
                >
                  <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-white" />
                </button>
              </div>
              <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-5 lg:mb-6">
                <div className="flex flex-col justify-center items-center gap-3 md:gap-4 lg:gap-5">
                  {restaurant?.logo_url ? (
                    <img
                      src={restaurant.logo_url}
                      alt={restaurant.name}
                      className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                    />
                  ) : (
                    <Utensils className="size-20 md:size-24 lg:size-28 text-white" />
                  )}
                  <div className="flex flex-col items-center justify-center">
                    <h2 className="text-xl md:text-2xl lg:text-3xl text-white font-bold">
                      {tc("orderStatusModalTitle")}
                    </h2>
                    <p className="text-sm md:text-base lg:text-lg text-white/80">
                      {tc("tableLabel", { table: tableNumber ?? "" })}
                    </p>
                    {activeOrders.length > 1 && (
                      <p className="text-sm md:text-base lg:text-lg text-white/80">
                        {t("orderPageOf", {
                          current: activeOrderIndex + 1,
                          total: activeOrders.length,
                        })}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-6 md:px-8 lg:px-10 border-t border-white/20 pt-4 md:pt-5 lg:pt-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium text-xl md:text-2xl lg:text-3xl text-white">
                    {tc("orderedItems")}
                  </h3>
                  <button
                    onClick={handleRefreshOrder}
                    disabled={isRefreshing}
                    className="rounded-full hover:bg-white/10 p-1 md:p-1.5 lg:p-2 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`size-5 md:size-6 lg:size-7 text-white ${isRefreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Order Items - Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 md:px-8 lg:px-10 pt-4 md:pt-5 lg:pt-6 pb-6 md:pb-8 lg:pb-10">
              {isRefreshing ? (
                <div className="flex justify-center items-center py-12 md:py-16 lg:py-20">
                  <Loader2 className="size-8 md:size-10 lg:size-12 animate-spin text-white" />
                </div>
              ) : activeOrder.dishes && activeOrder.dishes.length > 0 ? (
                <div className="space-y-3 md:space-y-4 lg:space-y-5">
                  {activeOrder.dishes.map((dish, index) => (
                    <div
                      key={dish.id || index}
                      className="flex items-start gap-3 md:gap-4 lg:gap-5 bg-white/5 rounded-xl md:rounded-2xl p-3 md:p-4 lg:p-5 border border-white/10"
                    >
                      <div className="shrink-0">
                        <div className="size-16 md:size-20 lg:size-24 bg-gray-300 rounded-sm flex items-center justify-center overflow-hidden">
                          {dish.images &&
                          dish.images.length > 0 &&
                          dish.images[0] ? (
                            <img
                              src={dish.images[0]}
                              alt={dish.item}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src="/even/even-asterisk-evergreen.svg"
                              alt="Logo Even"
                              className="size-10 md:size-12 lg:size-14 object-contain"
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base md:text-lg lg:text-xl text-white font-medium capitalize">
                          {dish.item}
                        </h3>
                        <div className="mt-1 md:mt-1.5 lg:mt-2">
                          <span
                            className={`inline-block px-2 md:px-3 lg:px-4 py-0.5 md:py-1 lg:py-1.5 text-xs md:text-sm lg:text-base font-medium rounded-full border ${getStatusColor(dish.status)}`}
                          >
                            {getStatusText(dish.status)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <p className="text-xs md:text-sm lg:text-base text-white/60">
                          {tc("quantityLabel", { quantity: dish.quantity })}
                        </p>
                        <p className="text-base md:text-lg lg:text-xl text-white font-medium">
                          $
                          {(
                            getItemDisplayPrice(Number(dish.price)) *
                            dish.quantity
                          ).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 md:py-10 lg:py-12">
                  <p className="text-white/70 text-base md:text-lg lg:text-xl">
                    {tc("noOrderInfo")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            style={{
              animation: isSettingsClosing
                ? "fadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "fadeIn 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={closeSettingsModal}
          />
          <div
            className="fixed inset-x-0 z-50 flex flex-col rounded-t-3xl shadow-2xl border-t border-white/20"
            style={{
              top: "5%",
              bottom: 0,
              paddingBottom: "env(safe-area-inset-bottom)",
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              animation: isSettingsClosing
                ? "slideDown 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300/80" />
            </div>
            <Suspense fallback={null}>
              {isAuthenticated && profile?.firstName ? (
                <div className="flex-1 min-h-0">
                  <DashboardView
                    onClose={closeSettingsModal}
                    onLogout={handleSettingsLogout}
                    initialTab={dashboardInitialTab}
                  />
                </div>
              ) : (
                <AuthView onClose={closeSettingsModal} />
              )}
            </Suspense>
          </div>
        </div>
      )}

      {/* Pepper Chat Modal */}
      {showPepperChat && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            style={{
              animation: isPepperClosing
                ? "fadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "fadeIn 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={closePepperChat}
          />
          <div
            className="fixed inset-x-0 z-50 flex flex-col rounded-t-3xl overflow-hidden shadow-2xl border-t border-white/30"
            style={{
              top: "12%",
              bottom: 0,
              paddingBottom: "env(safe-area-inset-bottom)",
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              animation: isPepperClosing
                ? "slideDown 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "slideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300/80" />
            </div>
            <Suspense fallback={null}>
              <ChatView onBack={closePepperChat} />
            </Suspense>
          </div>
          <style>{`
            @keyframes slideUp {
              from { transform: translateY(100%); opacity: 0.6; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes slideDown {
              from { transform: translateY(0);    opacity: 1; }
              to   { transform: translateY(100%); opacity: 0.6; }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes fadeOut {
              from { opacity: 1; }
              to   { opacity: 0; }
            }
          `}</style>
        </>
      )}

      {/* Reorder Modal */}
      <Suspense fallback={null}>
        <ReorderModal
          isOpen={showReorderModal}
          onClose={() => setShowReorderModal(false)}
          items={lastOrderItems}
        />
      </Suspense>

      {/* Restaurant Closed Modal */}
      <Suspense fallback={null}>
        <RestaurantClosedModal
          isOpen={showClosedModal}
          onClose={() => setShowClosedModal(false)}
          openingHours={restaurant?.opening_hours}
          restaurantName={restaurant?.name}
          restaurantLogo={restaurant?.logo_url}
        />
      </Suspense>
    </div>
  );
}
