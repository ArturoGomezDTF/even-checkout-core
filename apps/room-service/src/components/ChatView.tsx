"use client";

import { Check, ChevronDown, SendHorizontal, ShoppingBag } from "lucide-react";
import PepperIcon from "./UI/PepperIcon";
import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRestaurant } from "../context/RestaurantContext";
import { useGuest } from "../context/GuestContext";
import { useAuth } from "../context/AuthContext";
import { usePepper } from "../context/PepperContext";
import RestaurantClosedModal from "./RestaurantClosedModal";
import OutOfStockModal from "./OutOfStockModal";
import { useCart } from "@/context/CartContext";
import { cartApi } from "@/services/cart.service";
import { useModalBackClose } from "@/hooks/useModalBackClose";
import {
  ChatStatus,
  TwinPebbleIdle,
  PepperStatusAvatar,
} from "./UI/PepperMascots";

interface ChatViewProps {
  onBack: () => void;
}

// Tipo para los eventos del stream (basado en la API real de AI Spine)
interface StreamEvent {
  type:
    | "token"
    | "done"
    | "error"
    | "conversation_start"
    | "thinking_start"
    | "thinking_end"
    | "node_start"
    | "node_end"
    | "final_response"
    | "tool_start"
    | "tool_end";
  content?: string;
  session_id?: string;
  tool_name?: string;
  node_name?: string;
  node_type?: string;
  phase?: string;
}

// Función para streaming con el agente (muestra herramientas y tokens en tiempo real)
async function streamFromAgent(
  message: string,
  sessionId: string | null = null,
  userContext: string | null = null,
  onToken: (token: string) => void,
  onSessionId: (sessionId: string) => void,
  onToolStart: (toolName: string) => void,
  onToolEnd: () => void,
  onFinalResponse?: (content: string) => void,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window !== "undefined") {
    const authToken = localStorage.getItem("even_access_token");
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const guestId = localStorage.getItem("even-guest-id");
    if (guestId) headers["x-guest-id"] = guestId;
  }

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/ai-agent/customer/chat/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        session_id: sessionId,
        user_context: userContext,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Error del servidor: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No se pudo obtener el reader del stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));

          if (event.type === "token" && event.content) {
            onToken(event.content);
          } else if (event.type === "conversation_start" && event.session_id) {
            // Session ID viene en conversation_start
            onSessionId(event.session_id);
          } else if (event.type === "thinking_start") {
            // Mostrar indicador de "pensando"
            onToolStart("thinking");
          } else if (event.type === "thinking_end") {
            onToolEnd();
          } else if (event.type === "tool_start" && event.tool_name) {
            onToolStart(event.tool_name);
          } else if (event.type === "tool_end") {
            onToolEnd();
          } else if (event.type === "final_response" && event.content) {
            // La respuesta final viene completa - reemplazar, no agregar
            if (onFinalResponse) {
              onFinalResponse(event.content);
            } else {
              onToken(event.content);
            }
          } else if (event.type === "error") {
            throw new Error(event.content || "Error del agente");
          }
        } catch (e) {
          console.warn("Error parseando evento:", line);
        }
      }
    }
  }
}

// Mapeo de nombres de herramientas a claves de traducción
const toolTranslationKeys: Record<string, string> = {
  thinking: "toolThinking",
  get_restaurant_info: "toolGetRestaurantInfo",
  get_menu: "toolGetMenu",
  view_cart: "toolViewCart",
  add_to_cart: "toolAddToCart",
  update_cart_item_quantity: "toolUpdateCartItem",
  remove_from_cart: "toolRemoveFromCart",
  clear_cart: "toolClearCart",
};

// Componente para los puntos de carga animados
const LoadingDots = () => (
  <p className="flex items-center gap-1">
    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
      .
    </span>
    <span className="animate-bounce" style={{ animationDelay: "100ms" }}>
      .
    </span>
    <span className="animate-bounce" style={{ animationDelay: "200ms" }}>
      .
    </span>
  </p>
);

// Spinner SVG igual al de user/page.tsx
const Spinner = () => (
  <svg
    className="h-4 w-4 text-even-shamrock animate-spin"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// Función para renderizar texto con negritas (**texto**)
const renderBoldText = (text: string): React.ReactNode => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          part
        ),
      )}
    </>
  );
};

// Función para detectar si hay una URL de imagen incompleta al final del contenido
const hasIncompleteImageUrl = (text: string): boolean => {
  // Detectar markdown de imagen incompleto: ![...] o ![...]( o ![...](url incompleta
  if (/!\[[^\]]*\]?\(?[^)]*$/.test(text)) {
    return true;
  }
  // Detectar URL de imagen incompleta al final (empieza con http pero no termina con extensión de imagen completa)
  if (/https?:\/\/[^\s)]*$/.test(text)) {
    const urlMatch = text.match(/https?:\/\/[^\s)]*$/);
    if (urlMatch) {
      const partialUrl = urlMatch[0];
      // Si parece que está escribiendo una URL de imagen pero no está completa
      if (
        !/\.(jpg|jpeg|png|gif|webp|svg|avif)(\?[^\s)]*)?$/i.test(partialUrl)
      ) {
        return true;
      }
    }
  }
  return false;
};

const ORDER_BUTTON_REGEX =
  /\[ORDER_BUTTON:\s*dish_id=(\d+),\s*name="([^"]+)"\]/;

// Para ocultar el marcador mientras se está escribiendo en streaming
const PARTIAL_ORDER_BUTTON_REGEX = /\[ORDER_BUTTON:[\s\S]*$/;

// Botón que agrega directamente al carrito
const OrderButton = ({
  dishId,
  dishName,
  restaurantId,
  userId,
}: {
  dishId: number;
  dishName: string;
  restaurantId: number | null;
  userId: string | null;
}) => {
  const t = useTranslations("ChatView");
  const { menu, isOpen, restaurant } = useRestaurant();
  const { refreshCart } = useCart();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [showClosedModal, setShowClosedModal] = useState(false);
  const [showOutOfStockModal, setShowOutOfStockModal] = useState(false);
  useModalBackClose(showClosedModal, () => setShowClosedModal(false));
  useModalBackClose(showOutOfStockModal, () => setShowOutOfStockModal(false));

  // Resolver el ID real buscando por nombre en el menú cargado en contexto,
  // en lugar de confiar en el ID que provee el agente.
  // Usa matching por palabras clave para tolerar diferencias entre el nombre
  // que Pepper dice ("Wrap de Pollo") y el nombre real en BD ("Wrap Pollo").
  const resolvedDishId = useMemo(() => {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s*\([^)]*\)\s*/g, " ") // quitar paréntesis ej. "(3pz)"
        .trim();

    const STOP_WORDS = new Set([
      "de",
      "a",
      "la",
      "el",
      "los",
      "las",
      "con",
      "y",
      "en",
      "al",
      "del",
      "un",
      "una",
      "lo",
      "se",
      "su",
      "por",
      "o",
    ]);

    const keyWords = (s: string): string[] =>
      normalize(s)
        .split(/\s+/)
        .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

    if (!menu?.length) return dishId;

    const searchWords = keyWords(dishName);
    if (!searchWords.length) return dishId;

    let bestId = dishId;
    let bestScore = 0;

    for (const section of menu) {
      for (const item of section.items ?? []) {
        const itemWords = keyWords(item.name);
        if (!itemWords.length) continue;

        // Cuántas palabras clave del nombre buscado están en el item
        const matched = searchWords.filter((sw) =>
          itemWords.some(
            (iw) =>
              iw === sw ||
              (sw.length >= 4 && iw.startsWith(sw)) ||
              (iw.length >= 4 && sw.startsWith(iw)),
          ),
        ).length;

        // Score: proporción de palabras coincidentes vs total de palabras únicas
        const score = matched / Math.max(searchWords.length, itemWords.length);

        if (score > bestScore) {
          bestScore = score;
          bestId = item.id;
        }
      }
    }

    // Solo usar el match si la confianza es suficiente (≥50% de palabras coinciden)
    return bestScore >= 0.5 ? bestId : dishId;
  }, [menu, dishId, dishName]);

  const isOutOfStock = useMemo(() => {
    if (!menu?.length) return false;
    for (const section of menu) {
      for (const item of section.items ?? []) {
        if (item.id === resolvedDishId) return item.is_out_of_stock === true;
      }
    }
    return false;
  }, [menu, resolvedDishId]);

  const handleAdd = async () => {
    if (status !== "idle") return;
    if (!isOpen) {
      setShowClosedModal(true);
      return;
    }
    if (isOutOfStock) {
      setShowOutOfStockModal(true);
      return;
    }
    setStatus("loading");
    cartApi.setRestaurantId(restaurantId);
    cartApi.setSupabaseUserId(userId);
    const result = await cartApi.addToCart(resolvedDishId);
    if (result.success) {
      await refreshCart();
      setStatus("done");
    } else {
      setStatus("error");
    }
  };

  const glassStyle: React.CSSProperties =
    status === "done"
      ? {
          background:
            "linear-gradient(160deg, rgba(220,252,231,0.95) 0%, rgba(187,247,208,0.85) 100%)",
          boxShadow:
            "0 4px 16px rgba(74,222,128,0.25), 0 1px 0 rgba(255,255,255,0.8) inset",
          border: "1px solid rgba(134,239,172,0.5)",
        }
      : status === "error"
        ? {
            background:
              "linear-gradient(160deg, rgba(254,226,226,0.95) 0%, rgba(252,165,165,0.85) 100%)",
            boxShadow:
              "0 4px 16px rgba(239,68,68,0.2), 0 1px 0 rgba(255,255,255,0.7) inset",
            border: "1px solid rgba(252,165,165,0.5)",
          }
        : status === "loading"
          ? {
              background:
                "linear-gradient(160deg, rgba(245,210,255,0.7) 0%, rgba(220,140,238,0.6) 100%)",
              boxShadow: "0 2px 12px rgba(200,100,230,0.2)",
              border: "1px solid rgba(255,255,255,0.4)",
              backdropFilter: "blur(12px)",
            }
          : {
              background:
                "linear-gradient(160deg, rgba(250,220,255,0.97) 0%, rgba(235,178,244,0.92) 40%, rgba(210,130,235,0.88) 100%)",
              boxShadow:
                "0 6px 24px rgba(190,80,230,0.3), 0 1px 0 rgba(255,255,255,0.75) inset, 0 -1px 0 rgba(120,0,160,0.08) inset",
              border: "1px solid rgba(255,255,255,0.6)",
              backdropFilter: "blur(16px)",
            };

  return (
    <>
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
        itemName={dishName}
      />
      <button
        onClick={handleAdd}
        disabled={status === "loading" || status === "done"}
        className="mt-2 relative overflow-hidden flex items-center gap-2 transition-all active:scale-[0.97] font-semibold rounded-2xl px-5 py-3 text-base md:text-lg w-full justify-center text-black"
        style={glassStyle}
      >
        {/* Specular highlight — franja de luz en el borde superior */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none rounded-t-2xl"
          style={{
            height: "42%",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 100%)",
          }}
        />
        {/* Contenido */}
        <span className="relative z-10 flex items-center gap-2">
          {status === "done" ? (
            <>
              <Check className="size-5" />
              {t("addedToCart")}
            </>
          ) : status === "loading" ? (
            <>
              <Spinner />
              {t("addingEllipsis")}
            </>
          ) : (
            <>
              <ShoppingBag className="size-5" />
              {status === "error"
                ? t("errorTryAgain")
                : t("addDish", { dishName })}
            </>
          )}
        </span>
      </button>
    </>
  );
};

// 🔹 Función centralizada (clave)
function parseMessageContent(raw: string, isStreaming: boolean) {
  let dishId: number | null = null;
  let dishName: string | null = null;

  // 1. Extraer botón
  const match = raw.match(ORDER_BUTTON_REGEX);
  if (match) {
    dishId = Number(match[1]);
    dishName = match[2];
  }

  // 2. Limpiar contenido
  let text = raw.replace(ORDER_BUTTON_REGEX, "");

  if (isStreaming) {
    text = text.replace(PARTIAL_ORDER_BUTTON_REGEX, "");
  }

  return {
    text: text.trim(),
    dishId,
    dishName,
  };
}

// Componente para renderizar mensajes (sin memo para garantizar re-render con nuevas URLs)
const MessageContent = ({
  content,
  isStreaming,
  status,
  activeToolName,
  restaurantId,
  userId,
}: {
  content: string;
  isStreaming?: boolean;
  status: ChatStatus | null;
  activeToolName?: string | null;
  restaurantId: number | null;
  userId: string | null;
}) => {
  const t = useTranslations("ChatView");
  const { text, dishId, dishName } = parseMessageContent(
    content,
    !!isStreaming,
  );

  // 🔹 Estado vacío
  const statusLabel = (() => {
    if (status === "working") {
      const toolKey = activeToolName && toolTranslationKeys[activeToolName];
      return (
        <span className="text-gray-500">
          {toolKey ? t(toolKey) : activeToolName}
        </span>
      );
    }
    if (status === "thinking") {
      return <span className="text-gray-500">{t("toolThinking")}</span>;
    }
    return null;
  })();

  // Si el contenido está vacío, mostrar el estado de Pepper o puntos de carga
  if (!text) {
    return statusLabel ?? <LoadingDots />;
  }

  // 🔹 STREAMING
  if (isStreaming) {
    const IMAGE_PLACEHOLDER = "\u0000IMG\u0000";

    let processed = text
      .replace(
        /!\[[^\]]*\]\(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp|svg|avif)(?:\?[^\s)]*)?\)/gi,
        IMAGE_PLACEHOLDER,
      )
      .replace(/!\[[^\]]*\]?\(?https?:\/\/[^\s)]*$/, IMAGE_PLACEHOLDER)
      .replace(
        /(?<![(\[])(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp|svg|avif)(?:\?[^\s)]*)?)/gi,
        IMAGE_PLACEHOLDER,
      );

    if (hasIncompleteImageUrl(processed)) {
      processed = processed.replace(/https?:\/\/[^\s)]*$/, IMAGE_PLACEHOLDER);
    }

    const parts = processed.split(IMAGE_PLACEHOLDER);

    return (
      <div>
        {parts.map((part, i) => (
          <span key={i}>
            {part && (
              <span className="whitespace-pre-wrap">
                {renderBoldText(part)}
              </span>
            )}
            {i < parts.length - 1 && <LoadingDots />}
          </span>
        ))}
      </div>
    );
  }

  // 🔹 FINAL (no streaming)
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const directImageRegex =
    /(?<![(\[])(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp|svg|avif)(?:\?[^\s)]*)?)/gi;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  const matches: Array<{
    index: number;
    length: number;
    url: string;
    alt?: string;
  }> = [];

  let match;

  while ((match = markdownImageRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      url: match[2],
      alt: match[1],
    });
  }

  while ((match = directImageRegex.exec(text)) !== null) {
    const isInsideMarkdown = matches.some(
      (m) => match!.index >= m.index && match!.index < m.index + m.length,
    );
    if (!isInsideMarkdown) {
      matches.push({
        index: match.index,
        length: match[0].length,
        url: match[0],
      });
    }
  }

  matches.sort((a, b) => a.index - b.index);

  for (const m of matches) {
    if (m.index > lastIndex) {
      const chunk = text.slice(lastIndex, m.index);
      if (chunk.trim()) {
        elements.push(
          <p key={key++} className="whitespace-pre-wrap">
            {renderBoldText(chunk)}
          </p>,
        );
      }
    }

    elements.push(
      <img
        key={m.url + key++}
        src={m.url}
        alt={m.alt || "Imagen"}
        className="rounded-lg max-w-full h-auto"
        loading="lazy"
      />,
    );

    lastIndex = m.index + m.length;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk.trim()) {
      elements.push(
        <p key={key++} className="whitespace-pre-wrap">
          {renderBoldText(chunk)}
        </p>,
      );
    }
  }

  return (
    <div className="space-y-2">
      {elements.length > 0 ? (
        elements
      ) : (
        <p className="whitespace-pre-wrap">{renderBoldText(text)}</p>
      )}

      {dishId && dishName && (
        <OrderButton
          dishId={dishId}
          dishName={dishName}
          restaurantId={restaurantId}
          userId={userId}
        />
      )}
    </div>
  );
};

export default function ChatView({ onBack }: ChatViewProps) {
  const t = useTranslations("ChatView");
  const tc = useTranslations("Common");
  const [message, setMessage] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const approvedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado persistente de la conversación
  const {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    hasStartedChat,
    setHasStartedChat,
  } = usePepper();

  // Obtener contextos
  const { restaurantId, branchNumber } = useRestaurant();
  const { guestId, isGuest } = useGuest();
  const { user, profile } = useAuth();

  // Auto-scroll cuando cambian los mensajes o cambia el estado de Pepper
  useEffect(() => {
    if (messages.length > 0 || chatStatus !== "idle") {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [messages, chatStatus]);

  // Limpiar el timeout de "approved -> idle" si el componente se desmonta
  useEffect(() => {
    return () => {
      if (approvedTimeoutRef.current) {
        clearTimeout(approvedTimeoutRef.current);
      }
    };
  }, []);

  const handleSend = async () => {
    if (message.trim() && chatStatus === "idle") {
      if (approvedTimeoutRef.current) {
        clearTimeout(approvedTimeoutRef.current);
        approvedTimeoutRef.current = null;
      }
      if (!hasStartedChat) {
        setHasStartedChat(true);
      }

      const userMessage = message;
      const userMessageId = crypto.randomUUID();
      setMessages([
        ...messages,
        { id: userMessageId, role: "user", content: userMessage },
      ]);
      setMessage("");
      setChatStatus("thinking");
      setActiveToolName(null);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      try {
        // Determinar userId o guestId
        const userId = user?.id || null;
        const currentGuestId = isGuest ? guestId : null;

        const userContext = profile?.userContext || null;

        // Construir el mensaje con el contexto separado
        const contextualMessage = `[CONTEXT: restaurant_id=${restaurantId || "null"}, user_id=${userId || "null"}, guest_id=${currentGuestId || "null"}, branch_number=${branchNumber || "null"}]
        [USER_MESSAGE: ${userMessage}]`;

        // Agregar mensaje vacío de Pepper mientras se procesa
        const pepperMessageId = crypto.randomUUID();
        setMessages((prev) => [
          ...prev,
          { id: pepperMessageId, role: "pepper", content: "" },
        ]);

        // Llamar al agente con streaming
        await streamFromAgent(
          contextualMessage,
          sessionId,
          userContext,
          // Callback para cada token recibido - mostrar en tiempo real
          (token) => {
            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              const lastMessage = prev[lastIndex];
              if (lastMessage && lastMessage.role === "pepper") {
                return [
                  ...prev.slice(0, lastIndex),
                  { ...lastMessage, content: lastMessage.content + token },
                ];
              }
              return prev;
            });
          },
          // Callback para el session_id
          (newSessionId) => {
            if (!sessionId) {
              setSessionId(newSessionId);
            }
          },
          // Callback para cuando inicia una herramienta
          (toolName) => {
            if (toolName === "thinking") {
              setActiveToolName(null);
              setChatStatus("thinking");
            } else {
              setActiveToolName(toolName);
              setChatStatus("working");
            }
          },
          // Callback para cuando termina una herramienta
          () => {
            setActiveToolName(null);
            setChatStatus("thinking");
          },
          // Callback para respuesta final (reemplazar, no agregar)
          (content) => {
            setMessages((prev) => {
              const lastIndex = prev.length - 1;
              const lastMessage = prev[lastIndex];
              if (lastMessage && lastMessage.role === "pepper") {
                return [
                  ...prev.slice(0, lastIndex),
                  { ...lastMessage, content: content },
                ];
              }
              return prev;
            });
          },
        );

        setChatStatus("approved");
        approvedTimeoutRef.current = setTimeout(() => {
          setChatStatus("idle");
          approvedTimeoutRef.current = null;
        }, 1200);
      } catch (error) {
        console.error("Error al comunicarse con Pepper:", error);
        setChatStatus("idle");
        setActiveToolName(null);
        // Reemplazar el último mensaje (que está vacío o incompleto) con el error
        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          const lastMessage = prev[lastIndex];
          if (lastMessage && lastMessage.role === "pepper") {
            return [
              ...prev.slice(0, lastIndex),
              {
                ...lastMessage,
                content: t("errorGeneric"),
              },
            ];
          }
          return prev;
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {hasStartedChat ? (
        <div className="p-4 md:p-5 lg:p-6 flex items-center gap-3 md:gap-4 shrink-0">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-700 rounded-full p-1 md:p-1.5 lg:p-2 transition-colors cursor-pointer"
          >
            <ChevronDown className="size-6 md:size-7 lg:size-8" />
          </button>
          <div className="flex items-center gap-3 md:gap-4">
            <div className="bg-white rounded-full border border-black/20 size-10 md:size-12 lg:size-14">
              <PepperIcon />
            </div>
            <div>
              <h2 className="text-black/90 font-medium text-lg md:text-xl lg:text-2xl">
                Pepper
              </h2>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 md:p-5 lg:p-6 flex items-center shrink-0">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-700 rounded-full py-2 md:py-2.5 lg:py-3 transition-colors cursor-pointer"
          >
            <ChevronDown className="size-6 md:size-7 lg:size-8" />
          </button>
        </div>
      )}

      {/* Mensajes */}
      <div
        className={`flex-1 overflow-y-auto ${
          hasStartedChat
            ? "p-4 md:p-6 lg:p-8"
            : "flex items-center justify-center"
        }`}
      >
        {hasStartedChat && (
          <div className="min-h-full flex flex-col justify-end gap-3 md:gap-4 lg:gap-5">
            {messages.map((msg, index) => {
              const isLastPepperMessage =
                msg.role === "pepper" && index === messages.length - 1;
              return (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="flex flex-col items-start gap-1 max-w-[80%]">
                    <div
                      className={`rounded-xl md:rounded-2xl px-4 md:px-5 lg:px-6 py-2 md:py-3 lg:py-4 text-black text-base md:text-lg lg:text-xl ${
                        msg.role === "user" ? "bg-even-grass" : "bg-white/60"
                      }`}
                    >
                      <MessageContent
                        content={msg.content}
                        isStreaming={
                          isLastPepperMessage &&
                          (chatStatus === "thinking" ||
                            chatStatus === "working")
                        }
                        status={isLastPepperMessage ? chatStatus : null}
                        activeToolName={
                          isLastPepperMessage ? activeToolName : null
                        }
                        restaurantId={restaurantId}
                        userId={user?.id ?? null}
                      />
                    </div>
                    {isLastPepperMessage && (
                      <PepperStatusAvatar status={chatStatus} />
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
        {!hasStartedChat && (
          <div className="text-center max-w-md px-8 md:px-10 lg:px-12">
            <div className="mb-8 md:mb-10 lg:mb-12 flex justify-center">
              <TwinPebbleIdle className="w-40 md:w-48 lg:w-56 h-auto" />
            </div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-black mb-8 md:mb-10 lg:mb-12">
              Pepper
            </h2>
            <p className="text-gray-600 text-lg md:text-xl lg:text-2xl">
              {tc("welcomeSubtitle")}
            </p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 flex justify-center pb-6 px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-2 md:gap-3 lg:gap-4 bg-white/90 backdrop-blur-md rounded-full px-6 md:px-8 lg:px-10 py-4 md:py-5 lg:py-6 border border-white/40 w-full max-w-2xl">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            ref={inputRef}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={tc("inputPlaceholder")}
            className="flex-1 min-w-0 bg-transparent text-black placeholder-gray-500 focus:outline-none text-base md:text-lg lg:text-xl"
            style={{ textOverflow: "ellipsis" }}
          />
          <button
            onClick={handleSend}
            className="text-even-grass rounded-full transition-colors disabled:text-gray-400"
            disabled={!message.trim() || chatStatus !== "idle"}
          >
            <SendHorizontal className="size-6 md:size-7 lg:size-8 -rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}
