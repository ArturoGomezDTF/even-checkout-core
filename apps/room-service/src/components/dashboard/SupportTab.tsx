import { Bot, Mic, Plus, SendHorizontal } from "lucide-react";
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  memo,
  Dispatch,
  SetStateAction,
} from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../../context/AuthContext";
import { useRoom } from "../../context/RoomContext";

// Función para comunicarse con el agente a través del backend
async function chatWithAgent(message: string, sessionId: string | null = null) {
  // Identidad del comensal (guestAuth): token Supabase si hay sesión,
  // x-guest-id si es invitado. /ai-agent/chat es el Pepper de admin (401).
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
    `${process.env.NEXT_PUBLIC_API_URL}/ai-agent/customer/chat`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        message,
        session_id: sessionId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Error del servidor: ${response.status}`);
  }

  const data = await response.json();
  return data;
}

// Componente para renderizar mensajes con imágenes (memoizado para evitar re-renders innecesarios)
const MessageContent = memo(({ content }: { content: string }) => {
  // Regex para detectar URLs de imágenes (incluyendo avif)
  const imageUrlRegex =
    /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|avif)(?:\?[^\s]*)?)/gi;

  // Dividir el contenido en partes (texto e imágenes) y memoizar el resultado
  const parts = useMemo(() => content.split(imageUrlRegex), [content]);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        // Verificar si es una URL de imagen sin ejecutar match dos veces
        const isImage = imageUrlRegex.test(part);
        imageUrlRegex.lastIndex = 0; // Resetear el índice del regex

        if (isImage) {
          return (
            <img
              key={index}
              src={part}
              alt="Imagen del agente"
              className="rounded-lg max-w-full h-auto"
              loading="lazy"
            />
          );
        }
        return part ? (
          <p key={index} className="whitespace-pre-wrap">
            {part}
          </p>
        ) : null;
      })}
    </div>
  );
});

MessageContent.displayName = "MessageContent";

interface SupportTabProps {
  messages: Array<{ role: "user" | "pepper"; content: string }>;
  setMessages: Dispatch<
    SetStateAction<Array<{ role: "user" | "pepper"; content: string }>>
  >;
  sessionId: string | null;
  setSessionId: Dispatch<SetStateAction<string | null>>;
}

export default function SupportTab({
  messages,
  setMessages,
  sessionId,
  setSessionId,
}: SupportTabProps) {
  const t = useTranslations("SupportTab");
  const tc = useTranslations("Common");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { user, profile } = useAuth();
  const { state } = useRoom();

  // Auto-scroll cuando cambian los mensajes (solo cuando hay nuevos mensajes)
  useEffect(() => {
    if (messages.length > 0) {
      // Usar requestAnimationFrame para asegurar que el DOM esté actualizado
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (message.trim() && !isLoading) {
      const userMessage = message;
      setMessages([...messages, { role: "user", content: userMessage }]);
      setMessage("");
      setIsLoading(true);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      try {
        // Construir el mensaje con el contexto completo
        const userId = user?.id || null;
        const userName =
          profile?.firstName && profile?.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : profile?.firstName || null;
        const roomNumber = state.roomNumber || null;

        const contextualMessage = `[CONTEXT: service=support_dashboard, room_number=${roomNumber || "null"}, user_id=${userId || "null"}, user_name="${userName || "unknown"}"]
[USER_MESSAGE: ${userMessage}]`;

        const result = await chatWithAgent(contextualMessage, sessionId);

        // Guardar el session_id si es la primera vez
        if (result.session_id && !sessionId) {
          setSessionId(result.session_id);
        }

        // Agregar la respuesta de Pepper
        setMessages((prev) => [
          ...prev,
          { role: "pepper", content: result.response },
        ]);
      } catch (error) {
        console.error("Error al comunicarse con Pepper:", error);

        // Mostrar más detalles del error para debugging
        let errorMessage = t("errorMessage");
        if (error instanceof Error) {
          errorMessage += `\n\n${t("errorTechnicalDetails", { message: error.message })}`;
        }

        setMessages((prev) => [
          ...prev,
          {
            role: "pepper",
            content: errorMessage,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Mensajes con scroll */}
      <div className="flex-1 overflow-y-auto flex flex-col px-1 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md px-8">
              <div className="mb-6 flex justify-center">
                <div className="rounded-full h-20 w-20 md:h-24 md:w-24 bg-gray-100 flex items-center justify-center">
                  <Bot
                    className="w-12 h-12 md:w-14 md:h-14 text-black"
                    strokeWidth={1.5}
                  />
                </div>
              </div>
              <h2 className="text-2xl md:text-3xl font-medium text-gray-800 mb-3">
                {t("welcomeTitle")}
              </h2>
              <p className="text-gray-600 text-base md:text-lg mb-8">
                {tc("welcomeSubtitle")}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4 lg:space-y-5">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 md:px-5 lg:px-6 py-2 md:py-3 lg:py-4 text-black text-base md:text-lg lg:text-xl ${
                    msg.role === "user" ? "bg-even-grass" : "bg-gray-100"
                  }`}
                >
                  <MessageContent content={msg.content} />
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-xl px-4 md:px-5 lg:px-6 py-2 md:py-3 lg:py-4 text-black text-base md:text-lg lg:text-xl bg-gray-100">
                  <p className="flex items-center gap-1">
                    <span className="animate-bounce">.</span>
                    <span className="animate-bounce delay-100">.</span>
                    <span className="animate-bounce delay-200">.</span>
                  </p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input fijado en la parte inferior */}
      <div className="shrink-0 pt-4 pb-6">
        <div className="flex items-center gap-2 md:gap-3 lg:gap-4 bg-gray-100 rounded-full px-6 md:px-8 lg:px-10 py-4 md:py-5 lg:py-6 border border-gray-200">
          <button className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <Plus className="size-6 md:size-7 lg:size-8" />
          </button>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={tc("inputPlaceholder")}
            className="flex-1 min-w-0 bg-transparent text-black text-base md:text-lg lg:text-xl placeholder-gray-500 focus:outline-none"
            style={{
              textOverflow: "ellipsis",
            }}
          />
          <button className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <Mic className="size-6 md:size-7 lg:size-8" />
          </button>
          <button
            onClick={handleSend}
            className="text-even-evergreen rounded-full transition-colors disabled:text-gray-400"
            disabled={!message.trim() || isLoading}
          >
            <SendHorizontal className="size-6 md:size-7 lg:size-8 -rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
}
