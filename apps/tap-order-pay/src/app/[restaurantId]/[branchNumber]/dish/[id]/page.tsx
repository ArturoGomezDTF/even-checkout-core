"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartContext";
import { useTableNavigation } from "@/hooks/useTableNavigation";
import { useRestaurant } from "@/context/RestaurantContext";
import { useValidateAccess } from "@/hooks/useValidateAccess";
import { ChevronDown, X, Home, AlertCircle, CircleAlert, Trash2 } from "lucide-react";
import MenuHeaderDish from "@/components/headers/MenuHeaderDish";
import Loader from "@/components/UI/Loader";
import RestaurantClosedModal from "@/components/RestaurantClosedModal";
import OutOfStockModal from "@/components/OutOfStockModal";
import ValidationError from "@/components/ValidationError";
import {
  MenuItem as MenuItemDB,
  MenuItemData,
  CustomField,
} from "@/interfaces/menuItemData";
import { reviewsApi, Review, ReviewStats } from "@/services/reviews.service";
import { useAuth } from "@/context/AuthContext";
import { getItemDisplayPrice } from "@/utils/commissionCalculator";
import { usePersonalItemDiscounts } from "@/hooks/usePersonalItemDiscounts";

// Pure helpers — defined outside component to avoid recreation on every render

function parseCustomFields(item: MenuItemDB): CustomField[] {
  if (!item.custom_fields) return [];
  if (typeof item.custom_fields === "string") {
    try {
      const parsed = JSON.parse(item.custom_fields);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return item.custom_fields as CustomField[];
}

function adaptDish(item: MenuItemDB): MenuItemData {
  return {
    id: item.id,
    name: item.name,
    description: item.description || "",
    price: Number(item.price),
    images: item.image_url ? [item.image_url] : [],
    features: [],
    discount: item.discount || 0,
  };
}

export default function DishDetailPage() {
  const t = useTranslations("DishPage");
  const tc = useTranslations("Common");
  const params = useParams();
  const router = useRouter();
  const { validationError } = useValidateAccess();
  const dishId = parseInt(params.id as string);
  const editCartItemId = useSearchParams().get("cartItemId");
  const { state: cartState, addItem, updateQuantity, updateItem } = useCart();
  const { navigateWithTable } = useTableNavigation();
  const { restaurant, menu, isOpen, restaurantId: ctxRestaurantId } =
    useRestaurant();
  const personalDiscounts = usePersonalItemDiscounts(ctxRestaurantId);
  const [localQuantity, setLocalQuantity] = useState(0);
  const [dishQuantity, setDishQuantity] = useState(1);
  const [isPulsing, setIsPulsing] = useState(false);
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>(
    {},
  );
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  // Refs instead of state — touch values don't need to trigger re-renders
  const touchStartRef = useRef(0);
  const touchEndRef = useRef(0);
  const [customFieldSelections, setCustomFieldSelections] = useState<{
    [fieldId: string]: string | string[] | Record<string, number>;
  }>({});
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [hoveredReviewRating, setHoveredReviewRating] = useState(0);
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);
  const [dishStats, setDishStats] = useState<ReviewStats | null>(null);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const { user, isAuthenticated, isLoading } = useAuth();

  // Precarga instantánea desde el contexto del menú
  const initialDishData = useMemo(() => {
    if (!menu || menu.length === 0 || !dishId) return null;
    for (const section of menu) {
      const foundItem = section.items.find((item) => item.id === dishId);
      if (foundItem) {
        return {
          dish: adaptDish(foundItem),
          section: section.name,
          customFields: parseCustomFields(foundItem),
          isOutOfStock: (foundItem as MenuItemDB).is_out_of_stock ?? false,
        };
      }
    }
    return null;
  }, [menu, dishId]);

  const [dishLoading, setDishLoading] = useState(!initialDishData);
  const [dishError, setDishError] = useState<string | null>(null);
  const [dishData, setDishData] = useState<{
    dish: MenuItemData;
    section: string;
    customFields: CustomField[];
    isOutOfStock?: boolean;
  } | null>(initialDishData);

  // Fetch desde API (para recargas directas o si no está en caché)
  useEffect(() => {
    const fetchDish = async () => {
      if (!dishId) return;
      if (!dishData) setDishLoading(true);
      setDishError(null);
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/menu/items/${dishId}?restaurantId=${params.restaurantId}&branchNumber=${params.branchNumber}`,
        );
        if (!response.ok) {
          setDishError(response.status === 404 ? "not_found" : "error");
          setDishLoading(false);
          return;
        }
        const result = await response.json();
        if (!result.success || !result.data) {
          setDishError("error");
          setDishLoading(false);
          return;
        }
        const foundItem = result.data;
        let sectionName = t("defaultSectionName");
        if (menu && menu.length > 0) {
          for (const section of menu) {
            if (section.items.some((item) => item.id === dishId)) {
              sectionName = section.name;
              break;
            }
          }
        }
        setDishData({
          dish: adaptDish(foundItem),
          section: sectionName,
          customFields: parseCustomFields(foundItem),
          isOutOfStock: foundItem.is_out_of_stock ?? false,
        });
        setDishLoading(false);
      } catch (error) {
        console.error("Error fetching dish:", error);
        setDishError("error");
        setDishLoading(false);
      }
    };
    fetchDish();
  }, [dishId]);

  // Abrir todas las secciones por defecto
  useEffect(() => {
    if (dishData?.customFields && dishData.customFields.length > 0) {
      const allOpen: { [key: string]: boolean } = {};
      dishData.customFields.forEach((field) => {
        allOpen[field.id] = true;
      });
      setOpenSections(allOpen);
    }
  }, [dishData?.customFields]);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleDropdownChange = (fieldId: string, optionId: string) => {
    setCustomFieldSelections((prev) => {
      const isSelected = (prev[fieldId] as string[] | undefined)?.includes(
        optionId,
      );
      return { ...prev, [fieldId]: isSelected ? [] : [optionId] };
    });
  };

  const handleCheckboxChange = (
    fieldId: string,
    optionId: string,
    field?: CustomField,
  ) => {
    setCustomFieldSelections((prev) => {
      const current = (prev[fieldId] as string[]) || [];
      const isSelected = current.includes(optionId);
      if (isSelected) {
        return {
          ...prev,
          [fieldId]: current.filter((item) => item !== optionId),
        };
      }
      const maxSelections = field?.maxSelections || 1;
      if (current.length >= maxSelections) return prev;
      return { ...prev, [fieldId]: [...current, optionId] };
    });
  };

  const handleQuantityChange = (
    fieldId: string,
    optionId: string,
    quantity: number,
  ) => {
    setCustomFieldSelections((prev) => {
      const current = (prev[fieldId] as Record<string, number>) || {};
      const updated = { ...current };
      if (quantity > 0) {
        updated[optionId] = quantity;
      } else {
        delete updated[optionId];
      }
      return { ...prev, [fieldId]: updated };
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndRef.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!dishData) return;
    const distance = touchStartRef.current - touchEndRef.current;
    if (Math.abs(distance) < 50) return;
    if (distance > 0) {
      setCurrentImageIndex((prev) =>
        prev < dishData.dish.images.length - 1 ? prev + 1 : prev,
      );
    } else {
      setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev));
    }
  };

  const loadDishStats = useCallback(async () => {
    if (!dishId || isNaN(dishId)) return;
    try {
      const response = await reviewsApi.getMenuItemStats(dishId);
      if (response.success && response.data) {
        const stats = (response.data as any).data || response.data;
        setDishStats(stats as ReviewStats);
      }
    } catch (error) {
      console.error("Error loading dish stats:", error);
    }
  }, [dishId]);

  const loadMyReview = useCallback(async () => {
    if (!dishId || isNaN(dishId)) return;
    try {
      const userId = isAuthenticated ? (user?.id ?? null) : null;
      const guestId =
        !isAuthenticated && typeof window !== "undefined"
          ? localStorage.getItem("even-guest-id")
          : null;
      const response = await reviewsApi.getMyReview(dishId, userId, guestId);
      if (response.success && response.data) {
        const reviewData = (response.data as any).data || response.data;
        if (
          reviewData &&
          typeof reviewData === "object" &&
          "rating" in reviewData
        ) {
          setMyReview(reviewData as Review);
          setReviewRating(reviewData.rating);
        } else {
          setMyReview(null);
          setReviewRating(0);
        }
      } else {
        setMyReview(null);
        setReviewRating(0);
      }
    } catch (error) {
      console.error("Error loading my review:", error);
      setMyReview(null);
      setReviewRating(0);
    }
  }, [dishId, isAuthenticated, user]);

  useEffect(() => {
    if (dishId && !isNaN(dishId)) {
      setIsLoadingReviews(true);
      Promise.all([loadDishStats(), loadMyReview()]).finally(() => {
        setIsLoadingReviews(false);
      });
    }
  }, [dishId, loadDishStats, loadMyReview]);

  // Descuento personal de este producto para el usuario actual.
  // Si el producto también tiene descuento de admin-portal, gana el %
  // mayor entre los dos — nunca se suman.
  const personalDiscount = dishData
    ? personalDiscounts.get(dishData.dish.id)
    : undefined;
  const effectiveDiscount = dishData
    ? Math.max(dishData.dish.discount || 0, personalDiscount?.percentage || 0)
    : 0;

  // Precio total con extras — memoizado para evitar recálculo en cada render
  const totalPrice = useMemo(() => {
    if (!dishData) return 0;
    const basePrice =
      effectiveDiscount > 0
        ? dishData.dish.price * (1 - effectiveDiscount / 100)
        : dishData.dish.price;
    let extraPrice = 0;
    dishData.customFields?.forEach((field) => {
      const sel = customFieldSelections[field.id];
      if (
        field.type === "dropdown-quantity" &&
        sel &&
        typeof sel === "object" &&
        !Array.isArray(sel)
      ) {
        Object.entries(sel as Record<string, number>).forEach(
          ([optionId, qty]) => {
            const option = field.options?.find((o) => o.id === optionId);
            if (option && qty > 0) extraPrice += option.price * qty;
          },
        );
      } else if (Array.isArray(sel)) {
        field.options
          ?.filter((o) => sel.includes(o.id))
          .forEach((o) => {
            extraPrice += o.price;
          });
      }
    });
    return basePrice + extraPrice;
  }, [dishData, customFieldSelections, effectiveDiscount]);

  // Precio que se muestra al cliente (comisión Even ya incrustada) — nunca
  // se manda al carrito, solo para pantalla. buildCartItem sigue usando
  // totalPrice/basePrice reales.
  const displayTotalPrice = useMemo(
    () => getItemDisplayPrice(totalPrice),
    [totalPrice],
  );

  // La comisión se calcula sobre el precio combinado (base + extras), no
  // por separado — así que para que el precio base y cada extra mostrados
  // sumen exacto contra displayTotalPrice, se reparte la misma inflación
  // proporcionalmente entre todos los componentes.
  const priceMultiplier = useMemo(
    () => (totalPrice > 0 ? displayTotalPrice / totalPrice : 1),
    [displayTotalPrice, totalPrice],
  );

  // Validación de campos obligatorios — memoizada
  const isFormValid = useMemo(() => {
    if (!dishData?.customFields) return true;
    for (const field of dishData.customFields) {
      if (
        (field.type === "dropdown" || field.type === "checkboxes") &&
        field.required
      ) {
        const sel = customFieldSelections[field.id] as string[] | undefined;
        if (!sel || sel.length === 0) return false;
      }
    }
    return true;
  }, [dishData, customFieldSelections]);

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const editingItem = editCartItemId
    ? cartState.items.find((ci) => ci.cartItemId === editCartItemId)
    : undefined;
  const isEditMode = !!editCartItemId;

  const returnToCart = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      navigateWithTable("/cart", true);
    }
  }, [router, navigateWithTable]);

  // La línea ya no existe (o es promo): no hay nada que editar
  const leavingRef = useRef(false);
  useEffect(() => {
    if (!isEditMode || !cartState.hasLoaded || cartState.isLoading) return;
    if (leavingRef.current) return;
    if (
      !editingItem ||
      (editingItem.isPromoItem && !editingItem.userDiscountId)
    ) {
      navigateWithTable("/cart", true);
    }
  }, [isEditMode, editingItem, cartState.hasLoaded, cartState.isLoading, navigateWithTable]);

  // Precargar opciones, notas y cantidad de la línea a editar (una sola vez)
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !editingItem || !dishData) return;
    prefilledRef.current = true;

    const selections: typeof customFieldSelections = {};
    for (const saved of editingItem.customFields || []) {
      const field = dishData.customFields.find((f) => f.id === saved.fieldId);
      if (!field) continue;
      const validOptions = saved.selectedOptions.filter((o) =>
        field.options?.some((fo) => fo.id === o.optionId),
      );
      if (field.type === "dropdown-quantity") {
        selections[field.id] = Object.fromEntries(
          validOptions.map((o) => [
            o.optionId,
            (o as { quantity?: number }).quantity || 1,
          ]),
        );
      } else {
        selections[field.id] = validOptions.map((o) => o.optionId);
      }
    }
    setCustomFieldSelections(selections);
    setDishQuantity(editingItem.quantity);
    if (editingItem.specialInstructions) {
      setSpecialInstructions(editingItem.specialInstructions);
      setNotesOpen(true);
    }
  }, [editingItem, dishData]);

  // Helper compartido para construir el item del carrito
  const buildCartItem = useCallback(() => {
    if (!dishData) return null;
    const basePrice =
      effectiveDiscount > 0
        ? dishData.dish.price * (1 - effectiveDiscount / 100)
        : dishData.dish.price;

    const customFieldsData = dishData.customFields
      ?.map((field) => {
        const sel = customFieldSelections[field.id];
        type SelectedOption = {
          optionId: string;
          optionName: string;
          price: number;
          quantity: number;
        };
        let selectedOptions: SelectedOption[] = [];

        if (
          field.type === "dropdown-quantity" &&
          sel &&
          typeof sel === "object" &&
          !Array.isArray(sel)
        ) {
          selectedOptions = Object.entries(sel as Record<string, number>)
            .filter(([, qty]) => qty > 0)
            .map(([optionId, quantity]) => {
              const opt = field.options?.find((o) => o.id === optionId);
              return opt
                ? {
                    optionId: opt.id,
                    optionName: opt.name,
                    price: opt.price,
                    quantity,
                  }
                : null;
            })
            .filter((x): x is SelectedOption => x !== null);
        } else if (Array.isArray(sel)) {
          selectedOptions =
            field.options
              ?.filter((o) => sel.includes(o.id))
              .map((o) => ({
                optionId: o.id,
                optionName: o.name,
                price: o.price,
                quantity: 1,
              })) || [];
        }

        return {
          fieldId: field.id,
          fieldName: field.name,
          fieldType: field.type,
          origin: field.origin,
          selectedOptions,
        };
      })
      .filter((f) => f.selectedOptions.length > 0);

    const extraPrice =
      customFieldsData?.reduce(
        (sum, f) =>
          sum +
          f.selectedOptions.reduce(
            (s, o) => s + o.price * (o.quantity || 1),
            0,
          ),
        0,
      ) || 0;

    return {
      ...dishData.dish,
      price: basePrice,
      customFields: customFieldsData,
      extraPrice,
      specialInstructions: specialInstructions.trim() || null,
      userDiscountId: personalDiscount?.id ?? null,
    };
  }, [
    dishData,
    customFieldSelections,
    specialInstructions,
    effectiveDiscount,
    personalDiscount,
  ]);

  const handleAddToCart = async (e?: React.MouseEvent): Promise<boolean> => {
    e?.stopPropagation();
    if (!dishData || !isFormValid) return false;
    if (dishData.isOutOfStock) {
      setShowOutOfStockModal(true);
      return false;
    }
    if (!isOpen) {
      setShowClosedModal(true);
      return false;
    }
    const item = buildCartItem();
    if (!item) return false;

    setLocalQuantity((prev) => prev + dishQuantity);
    setIsPulsing(true);
    await addItem(item, dishQuantity, item.specialInstructions);
    sessionStorage.setItem(
      `lastItem_${dishData.dish.id}`,
      JSON.stringify(item),
    );
    return true;
  };

  const handleUpdateAndReturn = async () => {
    if (!dishData || !isFormValid || !editCartItemId) return;
    if (dishData.isOutOfStock) {
      setShowOutOfStockModal(true);
      return;
    }
    if (!isOpen) {
      setShowClosedModal(true);
      return;
    }
    const item = buildCartItem();
    if (!item) return;
    leavingRef.current = true;
    const ok = await updateItem(
      editCartItemId,
      item,
      dishQuantity,
      item.specialInstructions,
    );
    if (ok) {
      returnToCart();
    } else {
      leavingRef.current = false;
      setErrorMessage(t("errorUpdateCartItem"));
    }
  };

  const handleConfirmRemove = async () => {
    if (!editCartItemId) return;
    leavingRef.current = true;
    setShowRemoveConfirm(false);
    await updateQuantity(editCartItemId, 0);
    returnToCart();
  };

  const handleAddToCartAndReturn = async () => {
    const success = await handleAddToCart();
    if (success) setTimeout(() => navigateWithTable("/menu"), 200);
  };

  const handleRemoveFromCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dishData) return;
    setLocalQuantity((prev) => Math.max(0, prev - 1));
    const cartItem = cartState.items.find((ci) => ci.id === dishData.dish.id);
    if (cartItem?.cartItemId)
      await updateQuantity(cartItem.cartItemId, cartItem.quantity - 1);
  };

  const currentQuantity = dishData
    ? cartState.items.find((ci) => ci.id === dishData.dish.id)?.quantity || 0
    : 0;

  const displayQuantity = Math.max(localQuantity, currentQuantity);

  useEffect(() => {
    if (isPulsing) {
      const timer = setTimeout(() => setIsPulsing(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isPulsing]);

  const handleSubmitReview = async () => {
    if (reviewRating === 0 || !dishId || isNaN(dishId)) return;
    setIsSubmittingReview(true);
    try {
      const userId = isAuthenticated ? (user?.id ?? null) : null;
      const guestId =
        !isAuthenticated && typeof window !== "undefined"
          ? localStorage.getItem("even-guest-id")
          : null;

      const response = myReview
        ? await reviewsApi.updateReview(
            myReview.id,
            reviewRating,
            userId,
            guestId,
          )
        : await reviewsApi.createReview({
            menu_item_id: dishId,
            rating: reviewRating,
            user_id: userId,
            guest_id: guestId,
          });

      if (response?.success) {
        setIsReviewModalOpen(false);
        await Promise.all([loadDishStats(), loadMyReview()]);
      } else {
        throw new Error(
          (typeof response.error === "string"
            ? response.error
            : response.error?.message) || "Error al enviar reseña",
        );
      }
    } catch (error: any) {
      console.error("Error submitting review:", error);
      setErrorMessage(
        error.message?.includes("already reviewed")
          ? t("alreadyReviewed")
          : t("errorSubmitReview"),
      );
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Mostrar loader mientras valida o carga el platillo
  if (dishLoading) {
    return <Loader />;
  }

  // Mostrar error de validación
  if (validationError) {
    return <ValidationError errorType={validationError as any} />;
  }

  // Si hubo error cargando el platillo
  if (dishError === "error") {
    return (
      <div className="min-h-new brand-evergreen flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 md:mb-8 lg:mb-10 text-center">
              <div className="bg-red-500/20 p-3 md:p-4 lg:p-5 rounded-full w-fit mx-auto mb-4 md:mb-5 lg:mb-6">
                <AlertCircle className="size-10 md:size-12 lg:size-14 text-white" />
              </div>
              <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
                {t("errorLoadingTitle")}
              </h1>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                {t("errorLoadingMessage")}
              </p>
            </div>
            <div className="space-y-3 md:space-y-4 lg:space-y-5">
              <button
                onClick={() => router.push("/")}
                className="w-full bg-white hover:bg-gray-50 text-black py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95"
              >
                <div className="bg-even-grass p-2 md:p-2.5 lg:p-3 rounded-full">
                  <Home className="size-5 md:size-6 lg:size-7 text-even-evergreen" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {tc("backToHome")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-gray-600">
                    {t("backToHomeSubtitle")}
                  </p>
                </div>
              </button>
            </div>
            <div className="mt-6 md:mt-7 lg:mt-8 text-center">
              <p className="text-white/70 text-xs md:text-sm lg:text-base">
                {t("tryAgainLater")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si el platillo no fue encontrado o no hay datos
  if (dishError === "not_found" || !dishData) {
    return (
      <div className="min-h-new brand-evergreen flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-5 md:px-8 lg:px-10 pb-12 md:py-10 lg:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 md:mb-8 lg:mb-10 text-center">
              <h1 className="text-white text-xl md:text-2xl lg:text-3xl font-medium mb-2 md:mb-3 lg:mb-4">
                {t("dishNotFoundTitle")}
              </h1>
              <p className="text-white/80 text-sm md:text-base lg:text-lg">
                {t("dishNotFoundMessage")}
              </p>
            </div>
            <div className="space-y-3 md:space-y-4 lg:space-y-5">
              <button
                onClick={() => navigateWithTable("/menu")}
                className="w-full bg-white hover:bg-gray-50 text-black py-4 md:py-5 lg:py-6 px-4 md:px-5 lg:px-6 rounded-xl md:rounded-2xl transition-all duration-200 flex items-center gap-3 md:gap-4 lg:gap-5 active:scale-95"
              >
                <div className="bg-even-grass p-2 md:p-2.5 lg:p-3 rounded-full">
                  <Home className="size-5 md:size-6 lg:size-7 text-even-evergreen" />
                </div>
                <div className="flex-1 text-left">
                  <h2 className="text-base md:text-lg lg:text-xl font-medium mb-0.5 md:mb-1">
                    {t("backToMenu")}
                  </h2>
                  <p className="text-xs md:text-sm lg:text-base text-gray-600">
                    {t("viewAvailableDishes")}
                  </p>
                </div>
              </button>
            </div>
            <div className="mt-6 md:mt-7 lg:mt-8 text-center">
              <p className="text-white/70 text-xs md:text-sm lg:text-base">
                {t("dishMaybeUnavailable")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { dish, section } = dishData;

  return (
    <div className="h-dvh bg-white relative overflow-y-auto">
      <RestaurantClosedModal
        isOpen={showClosedModal}
        onClose={() => setShowClosedModal(false)}
        openingHours={restaurant?.opening_hours}
        restaurantName={restaurant?.name}
        restaurantLogo={restaurant?.logo_url}
      />
      <OutOfStockModal
        isOpen={showOutOfStockModal}
        onClose={() => setShowOutOfStockModal(false)}
        itemName={dish.name}
      />

      {/* Slider de imágenes */}
      <div className="absolute top-0 left-0 w-full h-96 md:h-112 lg:h-128 z-0">
        <div
          className="relative w-full h-full overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {dish.images.length > 0 ? (
            dish.images.map((image, index) => (
              <img
                key={index}
                src={image}
                alt=""
                className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-500 ${
                  index === currentImageIndex ? "opacity-100" : "opacity-0"
                }`}
              />
            ))
          ) : (
            <div className="absolute top-0 left-0 w-full h-full bg-gray-300 flex items-center justify-center">
              <img
                src="/even/even-asterisk-evergreen.svg"
                alt="Logo"
                className="w-24 md:w-32 lg:w-40 h-24 md:h-32 lg:h-40 object-contain"
              />
            </div>
          )}
        </div>

        {dishData?.isOutOfStock && (
          <div className="absolute bottom-22 z-10">
            <span className="bg-red-600 text-white text-xs md:text-sm font-bold px-3 py-1 tracking-wide">
              {tc("outOfStockBadge")}
            </span>
          </div>
        )}

        {dish.images.length > 1 && (
          <div className="absolute bottom-12 md:bottom-16 lg:bottom-20 left-0 right-0 flex justify-center gap-2 md:gap-3 z-10">
            {dish.images.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentImageIndex(index)}
                className={`h-2.5 md:h-3 lg:h-3.5 rounded-full transition-all duration-300 border border-white cursor-pointer ${
                  index === currentImageIndex
                    ? "w-2.5 md:w-3 lg:w-3.5 bg-white"
                    : "w-2.5 md:w-3 lg:w-3.5 bg-white/10"
                }`}
                aria-label={t("viewImageAlt", { number: index + 1 })}
              />
            ))}
          </div>
        )}
      </div>

      <MenuHeaderDish />

      <main className="mt-64 md:mt-80 lg:mt-96 relative z-10">
        <div className="bg-white rounded-t-4xl flex flex-col px-6 md:px-8 lg:px-10 pb-[100px] md:pb-[120px]">
          <div className="mt-8 md:mt-10 lg:mt-12">
            <div className="flex justify-between items-center text-black mb-6 md:mb-8">
              {isLoadingReviews ? (
                <>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <div className="size-6 md:size-7 lg:size-8 bg-gray-200 rounded animate-pulse" />
                    <div className="h-5 md:h-6 w-8 md:w-10 bg-gray-200 rounded animate-pulse" />
                  </div>
                  <div className="h-5 md:h-6 w-32 md:w-40 bg-gray-200 rounded animate-pulse" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <svg
                      className="size-6 md:size-7 lg:size-8 text-black"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    {dishStats && dishStats.total_reviews > 0 ? (
                      <>
                        <span className="text-lg md:text-xl lg:text-2xl">
                          {dishStats.average_rating.toFixed(1)}
                        </span>
                        <span className="text-xs md:text-sm lg:text-base text-gray-600">
                          ({dishStats.total_reviews})
                        </span>
                      </>
                    ) : (
                      <span className="text-sm md:text-base lg:text-lg text-gray-600">
                        {t("noReviews")}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setReviewRating(myReview?.rating ?? 0);
                      setIsReviewModalOpen(true);
                    }}
                    className="underline text-black text-sm md:text-base lg:text-lg"
                  >
                    {myReview ? t("editMyReview") : t("shareYourReview")}
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-col justify-between items-start mb-4 md:mb-6">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-black capitalize">
                {dish.name}
              </h2>
              {effectiveDiscount > 0 ? (
                <div>
                  <h2 className="text-black line-through text-sm md:text-base lg:text-lg">
                    ${getItemDisplayPrice(dish.price).toFixed(2)} MXN
                  </h2>
                  <span className="text-black text-xl md:text-2xl lg:text-3xl">
                    $
                    {getItemDisplayPrice(
                      dish.price * (1 - effectiveDiscount / 100),
                    ).toFixed(2)}{" "}
                    MXN
                  </span>
                </div>
              ) : (
                <div>
                  <h2 className="text-black text-xl md:text-2xl lg:text-3xl">
                    ${getItemDisplayPrice(dish.price).toFixed(2)} MXN
                  </h2>
                </div>
              )}
            </div>

            {dish.features.length > 0 && (
              <div className="flex gap-1 md:gap-1.5 mt-1 md:mt-2 mb-3 md:mb-4">
                {dish.features.map((feature, index) => (
                  <div
                    key={index}
                    className="text-sm md:text-base lg:text-lg text-black font-medium border border-stroke-soft/50 rounded-3xl px-3 md:px-4 py-1 md:py-1.5 shadow-sm"
                  >
                    {feature}
                  </div>
                ))}
              </div>
            )}

            <p className="text-black text-base md:text-lg lg:text-xl leading-relaxed mb-8 md:mb-10">
              {dish.description}
            </p>

            {/* Custom Fields Dinámicos */}
            {dishData.customFields && dishData.customFields.length > 0 && (
              <div className="grid gap-6 md:gap-8 mb-6 md:mb-8">
                {dishData.customFields.map((field) => (
                  <div key={field.id}>
                    <div
                      className="flex justify-between items-center pb-2 md:pb-3 border-b border-stroke cursor-pointer"
                      onClick={() => toggleSection(field.id)}
                    >
                      <div className="flex flex-col flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-black text-xl md:text-2xl lg:text-3xl mb-4">
                            {field.name}
                          </h3>
                          {(field.type === "dropdown" ||
                            field.type === "checkboxes") &&
                            field.required &&
                            (() => {
                              const sel = customFieldSelections[field.id] as
                                | string[]
                                | undefined;
                              const has = sel && sel.length > 0;
                              return (
                                <div
                                  className={`rounded px-2 py-1 ${has ? "bg-gray-100" : "bg-green-100"}`}
                                >
                                  <span
                                    className={`text-sm md:text-base lg:text-lg font-normal ${has ? "text-gray-500" : "text-green-600"}`}
                                  >
                                    {t("required")}
                                  </span>
                                </div>
                              );
                            })()}
                        </div>

                        <div className="flex justify-between items-center">
                          <div>
                            {field.type === "dropdown" &&
                              !openSections[field.id] &&
                              (() => {
                                const sel = customFieldSelections[field.id] as
                                  | string[]
                                  | undefined;
                                if (sel && sel.length > 0) {
                                  const opt = field.options?.find(
                                    (o) => o.id === sel[0],
                                  );
                                  return (
                                    <span className="text-black text-sm md:text-base mt-1">
                                      {opt?.name || t("selectOption")}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-stroke text-sm md:text-base mt-1">
                                    {t("chooseOption")}
                                  </span>
                                );
                              })()}

                            {field.type === "dropdown" &&
                              openSections[field.id] && (
                                <span className="text-black text-sm md:text-base mt-1">
                                  {t("selectOption")}
                                </span>
                              )}

                            {(() => {
                              const sel = customFieldSelections[field.id];
                              if (
                                field.type === "dropdown-quantity" &&
                                sel &&
                                typeof sel === "object" &&
                                !Array.isArray(sel)
                              ) {
                                const total = Object.values(
                                  sel as Record<string, number>,
                                ).reduce((s, n) => s + n, 0);
                                if (total > 0)
                                  return (
                                    <span className="text-black text-sm md:text-base mt-1">
                                      {t("productsSelected", { count: total })}
                                    </span>
                                  );
                              }
                              if (
                                field.type === "dropdown-quantity" &&
                                (!sel ||
                                  Array.isArray(sel) ||
                                  typeof sel !== "object" ||
                                  Object.keys(sel as object).length === 0)
                              ) {
                                return (
                                  <span className="text-stroke text-sm md:text-base mt-1">
                                    {t("customizeExtras")}
                                  </span>
                                );
                              }
                              return null;
                            })()}

                            {field.type === "checkboxes" &&
                              (() => {
                                const sel =
                                  (customFieldSelections[
                                    field.id
                                  ] as string[]) || [];
                                const max = field.maxSelections || 1;
                                return sel.length > 0 ? (
                                  <span className="text-black text-sm md:text-base mt-1">
                                    {t("productsSelected", {
                                      count: sel.length,
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-gray-600 text-sm md:text-base mt-1">
                                    {t("selectUpTo", { max })}
                                  </span>
                                );
                              })()}
                          </div>

                          <div className="size-7 md:size-8 lg:size-9 bg-surface rounded-full flex items-center justify-center border border-stroke/50">
                            <ChevronDown
                              className={`size-5 md:size-6 lg:size-7 text-black transition-transform duration-250 ${openSections[field.id] ? "rotate-180" : ""}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {openSections[field.id] && (
                      <div className="mt-3 md:mt-4">
                        {field.type === "dropdown" && field.options && (
                          <div className="bg-white rounded-lg border border-stroke/30 shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
                            {field.options.map((option, index) => {
                              const sel = customFieldSelections[field.id] as
                                | string[]
                                | undefined;
                              const isSelected =
                                sel?.includes(option.id) || false;
                              return (
                                <div
                                  key={option.id}
                                  onClick={() =>
                                    !option.agotado &&
                                    handleDropdownChange(field.id, option.id)
                                  }
                                  className={`flex items-center justify-between gap-2 md:gap-3 py-4 md:py-5 px-4 md:px-6 transition-colors duration-200 ${
                                    option.agotado
                                      ? "cursor-not-allowed opacity-50"
                                      : "cursor-pointer hover:bg-surface"
                                  } ${
                                    isSelected ? "bg-even-grass/10" : ""
                                  } ${index !== (field.options?.length ?? 0) - 1 ? "border-b border-stroke/20" : ""}`}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-black text-base md:text-lg lg:text-xl">
                                      {option.name}
                                    </span>
                                    {option.agotado ? (
                                      <span className="text-red-600 font-medium text-[10px] md:text-xs uppercase tracking-wider">
                                        Agotado
                                      </span>
                                    ) : (
                                      option.price > 0 && (
                                        <span className="text-even-grass font-medium text-sm md:text-base lg:text-lg">
                                          +${(option.price * priceMultiplier).toFixed(2)}
                                        </span>
                                      )
                                    )}
                                  </div>
                                  <input
                                    type="radio"
                                    checked={isSelected}
                                    disabled={option.agotado}
                                    onChange={() => {}}
                                    onClick={(e) => e.stopPropagation()}
                                    className="myradio md:scale-125 lg:scale-150 pointer-events-none"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {field.type === "dropdown-quantity" &&
                          field.options && (
                            <div className="bg-white rounded-lg border border-stroke/30 shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
                              {field.options.map((option, index) => {
                                const sel = customFieldSelections[field.id];
                                const qty =
                                  (sel &&
                                  typeof sel === "object" &&
                                  !Array.isArray(sel)
                                    ? (sel as Record<string, number>)[option.id]
                                    : 0) || 0;
                                return (
                                  <div
                                    key={option.id}
                                    className={`flex items-center justify-between gap-2 md:gap-3 py-4 md:py-5 px-4 md:px-6 ${
                                      option.agotado ? "opacity-50" : ""
                                    } ${
                                      index !== (field.options?.length ?? 0) - 1
                                        ? "border-b border-stroke/20"
                                        : ""
                                    }`}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-black text-base md:text-lg lg:text-xl">
                                        {option.name}
                                      </span>
                                      {option.agotado ? (
                                        <span className="text-red-600 font-medium text-[10px] md:text-xs uppercase tracking-wider">
                                          Agotado
                                        </span>
                                      ) : (
                                        option.price > 0 && (
                                          <span className="text-even-grass font-medium text-sm md:text-base lg:text-lg">
                                            +${(option.price * priceMultiplier).toFixed(2)}
                                          </span>
                                        )
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <button
                                        onClick={() =>
                                          handleQuantityChange(
                                            field.id,
                                            option.id,
                                            Math.max(0, qty - 1),
                                          )
                                        }
                                        disabled={qty <= 0 || option.agotado}
                                        className="w-8 h-8 md:w-9 md:h-9 bg-surface hover:bg-even-grass/20 rounded-full flex items-center justify-center border border-stroke/50 transition-colors duration-200 disabled:opacity-40"
                                      >
                                        <span className="text-lg font-medium text-stroke">
                                          −
                                        </span>
                                      </button>
                                      <span className="text-lg md:text-xl font-medium text-black min-w-8 text-center">
                                        {qty}
                                      </span>
                                      <button
                                        onClick={() =>
                                          !option.agotado &&
                                          handleQuantityChange(
                                            field.id,
                                            option.id,
                                            qty + 1,
                                          )
                                        }
                                        disabled={option.agotado}
                                        className="w-8 h-8 md:w-9 md:h-9 bg-surface hover:bg-even-grass/20 rounded-full flex items-center justify-center border border-stroke/50 transition-colors duration-200 disabled:opacity-40"
                                      >
                                        <span className="text-lg font-medium text-stroke">
                                          +
                                        </span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        {field.type === "checkboxes" && field.options && (
                          <div className="bg-white rounded-lg border border-stroke/30 shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
                            {field.options.map((option, index) => {
                              const currentSelections =
                                (customFieldSelections[field.id] as string[]) ||
                                [];
                              const maxSelections = field.maxSelections || 1;
                              const isSelected = currentSelections.includes(
                                option.id,
                              );
                              const isDisabled =
                                option.agotado ||
                                (!isSelected &&
                                  currentSelections.length >= maxSelections);
                              return (
                                <label
                                  key={option.id}
                                  className={`flex items-center justify-between gap-2 md:gap-3 py-4 md:py-5 px-4 md:px-6 hover:bg-surface transition-colors duration-200 ${isSelected ? "bg-even-grass/10" : ""} ${isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"} ${index !== (field.options?.length ?? 0) - 1 ? "border-b border-stroke/20" : ""}`}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-black text-base md:text-lg lg:text-xl">
                                      {option.name}
                                    </span>
                                    {option.agotado ? (
                                      <span className="text-red-600 font-medium text-[10px] md:text-xs uppercase tracking-wider">
                                        Agotado
                                      </span>
                                    ) : (
                                      option.price > 0 && (
                                        <span className="text-even-grass font-medium text-sm md:text-base lg:text-lg">
                                          +${(option.price * priceMultiplier).toFixed(2)}
                                        </span>
                                      )
                                    )}
                                  </div>
                                  <input
                                    type="checkbox"
                                    disabled={isDisabled}
                                    checked={isSelected}
                                    onChange={() =>
                                      handleCheckboxChange(
                                        field.id,
                                        option.id,
                                        field,
                                      )
                                    }
                                    className="mycheckbox md:scale-125 lg:scale-150"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Comentarios */}
            <div className="text-black">
              <div
                className="flex justify-between items-center gap-3 cursor-pointer"
                onClick={() => setNotesOpen((prev) => !prev)}
              >
                <h3 className="font-medium text-black text-xl md:text-2xl lg:text-3xl">
                  {tc("anythingToKnow")}
                </h3>
                <div className="size-7 md:size-8 lg:size-9 shrink-0 bg-surface rounded-full flex items-center justify-center border border-stroke/50">
                  <ChevronDown
                    className={`size-5 md:size-6 lg:size-7 text-black transition-transform duration-250 ${notesOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </div>

              {notesOpen && (
                <div className="mt-3 md:mt-4 animate-in slide-in-from-top-2 duration-200">
                  <textarea
                    className="h-24 md:h-28 lg:h-32 text-base md:text-lg lg:text-xl w-full bg-surface border border-stroke-soft px-3 md:px-4 py-2 md:py-3 rounded-lg resize-none focus:outline-none"
                    placeholder={t("notesPlaceholder")}
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    maxLength={60}
                    onBlur={() =>
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                  />
                  <p className="text-right text-sm text-gray-400 mt-1">
                    {specialInstructions.length}/60
                  </p>
                </div>
              )}
            </div>

            {/* Bottom bar */}
            <div
              className="fixed bottom-0 left-0 right-0 z-10 flex items-center gap-3 px-4 md:px-6 lg:px-8 pt-4 md:pt-5"
              style={{
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                background: "rgba(255, 255, 255, 0.75)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
            >
              <div className="flex items-center bg-white border border-gray-300 rounded-2xl shadow-sm shrink-0">
                <button
                  onClick={() =>
                    isEditMode && dishQuantity === 1
                      ? setShowRemoveConfirm(true)
                      : setDishQuantity((q) => Math.max(1, q - 1))
                  }
                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-black text-xl font-light active:scale-90 transition-transform"
                >
                  {isEditMode && dishQuantity === 1 ? (
                    <Trash2 className="size-5 md:size-6 text-red-500" />
                  ) : (
                    "−"
                  )}
                </button>
                <span className="w-8 text-center text-base md:text-lg font-medium text-black select-none">
                  {dishQuantity}
                </span>
                <button
                  onClick={() => setDishQuantity((q) => q + 1)}
                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-black text-xl font-light active:scale-90 transition-transform"
                >
                  +
                </button>
              </div>

              <button
                onClick={
                  isEditMode ? handleUpdateAndReturn : handleAddToCartAndReturn
                }
                disabled={!isFormValid}
                className={`flex-1 text-even-evergreen py-3.5 md:py-4 lg:py-5 rounded-2xl flex items-center justify-center ${
                  dishData?.isOutOfStock
                    ? "bg-gray-400 cursor-pointer active:scale-95 transition-transform"
                    : isFormValid
                      ? "bg-even-grass active:scale-95 transition-transform"
                      : "bg-gray-400 cursor-not-allowed opacity-60"
                }`}
              >
                <span className="text-base md:text-lg font-medium">
                  {dishData?.isOutOfStock
                    ? t("outOfStockCta")
                    : t(isEditMode ? "updateCartCta" : "addToCartCta", {
                        amount: (displayTotalPrice * dishQuantity).toFixed(2),
                      })}
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Review Modal */}
      {isReviewModalOpen && (
        <div
          className="fixed inset-0 bg-black/25 z-999 flex items-end justify-center"
          onClick={() => setIsReviewModalOpen(false)}
        >
          <div
            className="bg-white w-full rounded-t-4xl overflow-y-auto z-999 max-h-[85vh] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-end">
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="p-2 md:p-3 lg:p-4 hover:bg-gray-100 rounded-lg transition-colors justify-end flex items-end mt-3 md:mt-4 lg:mt-5 mr-3 md:mr-4 lg:mr-5"
              >
                <X className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-gray-600" />
              </button>
            </div>

            <div className="px-6 md:px-8 lg:px-10 flex items-center justify-center mb-4 md:mb-6">
              <div className="flex flex-col justify-center items-center gap-3 md:gap-4">
                {dish.images.length > 0 ? (
                  <img
                    src={dish.images[0]}
                    alt={dish.name}
                    className="size-20 md:size-24 lg:size-28 object-cover rounded-lg md:rounded-xl"
                  />
                ) : (
                  <div className="size-20 md:size-24 lg:size-28 bg-gray-300 rounded-lg md:rounded-xl flex items-center justify-center">
                    <img
                      src="/even/even-asterisk-evergreen.svg"
                      alt="Logo"
                      className="size-12 md:size-14 lg:size-16 object-contain"
                    />
                  </div>
                )}
                <div className="flex flex-col items-center justify-center">
                  <h2 className="text-xl md:text-2xl lg:text-3xl text-black capitalize">
                    {dish.name}
                  </h2>
                  <p className="text-sm md:text-base lg:text-lg text-gray-600">
                    {section}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 md:px-8 lg:px-10 space-y-4 md:space-y-6">
              <div className="border-t border-stroke pt-4 md:pt-6">
                <h3 className="font-normal text-lg md:text-xl lg:text-2xl text-black mb-3 md:mb-4 text-center">
                  {t("howWouldYouRate")}
                </h3>
                <div className="flex justify-center gap-2 md:gap-3 lg:gap-4 mb-4 md:mb-6">
                  {[1, 2, 3, 4, 5].map((starIndex) => {
                    const isFilled =
                      (hoveredReviewRating || reviewRating) >= starIndex;
                    return (
                      <button
                        key={starIndex}
                        onMouseEnter={() => setHoveredReviewRating(starIndex)}
                        onMouseLeave={() => setHoveredReviewRating(0)}
                        onClick={() => setReviewRating(starIndex)}
                      >
                        <svg
                          className={`size-8 md:size-10 lg:size-12 ${isFilled ? "text-yellow-400" : "text-white"}`}
                          fill="currentColor"
                          stroke={isFilled ? "#facc15" : "black"}
                          strokeWidth="1"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 md:pt-6 pb-6 md:pb-8 lg:pb-10">
                <button
                  onClick={handleSubmitReview}
                  disabled={reviewRating === 0 || isSubmittingReview}
                  className={`w-full text-even-evergreen py-3 md:py-4 lg:py-5 rounded-full transition-colors text-base md:text-lg lg:text-xl bg-even-grass ${
                    reviewRating === 0 || isSubmittingReview
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }`}
                >
                  {isSubmittingReview
                    ? t("submittingReview")
                    : myReview
                      ? t("updateReviewCta")
                      : t("submitReviewCta")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Confirm Modal */}
      {showRemoveConfirm && (
        <div
          className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/50"
          onClick={() => setShowRemoveConfirm(false)}
        >
          <div
            className="bg-white rounded-t-4xl w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 max-w-2xl mx-auto">
              <div className="flex flex-col items-center mb-4">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <Trash2 className="size-7 text-red-500" strokeWidth={2} />
                </div>
                <h2 className="text-xl font-semibold text-black text-center">
                  {t("removeItemTitle")}
                </h2>
              </div>
              <p className="text-gray-700 text-sm text-center mb-6">
                {t("removeItemMessage", { name: dish.name })}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="flex-1 bg-surface border border-stroke-soft text-black py-3 rounded-full text-base"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleConfirmRemove}
                  className="flex-1 bg-red-500 text-white py-3 rounded-full text-base"
                >
                  {t("removeItemConfirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Error Modal */}
      {errorMessage && (
        <div
          className="fixed inset-0 z-99999 flex items-end justify-center bg-black/50"
          onClick={() => setErrorMessage(null)}
        >
          <div
            className="bg-white rounded-t-4xl w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 max-w-2xl mx-auto">
              <div className="flex flex-col items-center mb-4">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <CircleAlert
                    className="size-7 text-red-500"
                    strokeWidth={2}
                  />
                </div>
                <h2 className="text-xl font-semibold text-black text-center">
                  {tc("errorTitle")}
                </h2>
              </div>
              <div className="bg-surface border border-stroke-soft/50 rounded-xl p-4 mb-6">
                <p className="text-gray-700 text-sm text-center">
                  {errorMessage}
                </p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="w-full bg-even-grass text-even-evergreen py-3 rounded-full text-base"
              >
                {tc("understood")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
