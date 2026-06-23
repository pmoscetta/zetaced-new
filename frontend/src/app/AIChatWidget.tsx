"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchProtectedJson } from "./protected-api";

export type ChatFilters = {
  station_ids: number[];
  sensor_ids: number[];
  date_from: string | null;
  date_to: string | null;
  alignment_seconds: number | null;
};

export const APPLY_FILTERS_EVENT = "zetaced:apply-filters";

type ChatResponse = {
  reply: string;
  filters: ChatFilters | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  filters?: ChatFilters | null;
};

type ChatPage = "data" | "chart" | "map" | "alarms";

const PAGE_FROM_PATHNAME: Record<string, ChatPage> = {
  "/data": "data",
  "/chart": "chart",
  "/map": "map",
  "/alarms": "alarms",
};

export default function AIChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        "Hi! Ask me to filter the monitoring data, e.g. \"show nitrate from station Arno over the last 7 days\". Posso rispondere anche in italiano.",
    },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentPage = useMemo<ChatPage>(
    () => PAGE_FROM_PATHNAME[pathname ?? ""] ?? "data",
    [pathname]
  );

  const canAutoApply = currentPage === "data" || currentPage === "chart";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);
    setError("");

    try {
      const payload = await fetchProtectedJson<ChatResponse>("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          current_page: currentPage,
        }),
      });

      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: payload.reply,
          filters: payload.filters,
        },
      ]);

      if (payload.filters && hasFilterContent(payload.filters) && canAutoApply) {
        applyFilters(payload.filters);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "The assistant is unavailable right now."
      );
    } finally {
      setIsSending(false);
    }
  }

  function applyFilters(filters: ChatFilters) {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent<ChatFilters>(APPLY_FILTERS_EVENT, { detail: filters })
    );
  }

  return (
    <div style={containerStyle}>
      {isOpen ? (
        <section style={panelStyle}>
          <header style={panelHeaderStyle}>
            <div>
              <p style={panelEyebrowStyle}>AI Assistant</p>
              <p style={panelTitleStyle}>Data Copilot</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              style={closeButtonStyle}
            >
              ×
            </button>
          </header>

          <div ref={scrollRef} style={messageListStyle}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: "flex",
                  justifyContent:
                    message.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={
                    message.role === "user" ? userBubbleStyle : assistantBubbleStyle
                  }
                >
                  <span>{message.text}</span>
                  {message.filters && hasFilterContent(message.filters) ? (
                    <FilterBadge
                      filters={message.filters}
                      canApply={canAutoApply}
                      onApply={() => applyFilters(message.filters as ChatFilters)}
                    />
                  ) : null}
                </div>
              </div>
            ))}
            {isSending ? (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={assistantBubbleStyle}>Thinking…</div>
              </div>
            ) : null}
          </div>

          {error ? <div style={errorBarStyle}>{error}</div> : null}

          <form onSubmit={handleSubmit} style={inputRowStyle}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask me to filter data..."
              style={textInputStyle}
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              style={sendButtonStyle(isSending || !input.trim())}
            >
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        style={launcherStyle}
        aria-label={isOpen ? "Hide assistant" : "Open assistant"}
      >
        {isOpen ? "Close" : "Ask AI"}
      </button>
    </div>
  );
}

type FilterBadgeProps = {
  filters: ChatFilters;
  canApply: boolean;
  onApply: () => void;
};

function FilterBadge({ filters, canApply, onApply }: FilterBadgeProps) {
  return (
    <div style={filterBadgeStyle}>
      <span style={{ color: "#7dd3fc", fontWeight: 600 }}>
        Suggested filters
      </span>
      <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.5 }}>
        {filters.station_ids.length > 0 ? (
          <li>Stations: {filters.station_ids.join(", ")}</li>
        ) : null}
        {filters.sensor_ids.length > 0 ? (
          <li>Sensors: {filters.sensor_ids.join(", ")}</li>
        ) : null}
        {filters.date_from ? <li>From: {formatDate(filters.date_from)}</li> : null}
        {filters.date_to ? <li>To: {formatDate(filters.date_to)}</li> : null}
        {filters.alignment_seconds != null ? (
          <li>Alignment: {filters.alignment_seconds}s</li>
        ) : null}
      </ul>
      <button
        type="button"
        onClick={onApply}
        style={applyButtonStyle(!canApply)}
        disabled={!canApply}
      >
        {canApply ? "Apply on this page" : "Open Data page to apply"}
      </button>
    </div>
  );
}

function hasFilterContent(filters: ChatFilters): boolean {
  return (
    filters.station_ids.length > 0 ||
    filters.sensor_ids.length > 0 ||
    filters.date_from != null ||
    filters.date_to != null ||
    filters.alignment_seconds != null
  );
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

const containerStyle: CSSProperties = {
  position: "fixed",
  right: "1.5rem",
  bottom: "1.5rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "0.75rem",
  zIndex: 1000,
};

const panelStyle: CSSProperties = {
  width: "min(22rem, calc(100vw - 3rem))",
  height: "30rem",
  maxHeight: "calc(100vh - 6rem)",
  display: "flex",
  flexDirection: "column",
  backgroundColor: "#0d1728",
  border: "1px solid #24324a",
  borderRadius: "1rem",
  boxShadow: "0 20px 45px rgba(2, 6, 23, 0.55)",
  overflow: "hidden",
};

const panelHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "1rem 1.1rem",
  backgroundColor: "#111c30",
  borderBottom: "1px solid #24324a",
};

const panelEyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#38bdf8",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontSize: "0.7rem",
};

const panelTitleStyle: CSSProperties = {
  margin: "0.2rem 0 0",
  color: "#f8fafc",
  fontSize: "1.05rem",
  fontWeight: 700,
};

const closeButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#94a3b8",
  fontSize: "1.5rem",
  lineHeight: 1,
  cursor: "pointer",
};

const messageListStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const baseBubbleStyle: CSSProperties = {
  maxWidth: "85%",
  borderRadius: "0.9rem",
  padding: "0.7rem 0.85rem",
  fontSize: "0.92rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const userBubbleStyle: CSSProperties = {
  ...baseBubbleStyle,
  backgroundColor: "#0ea5e9",
  color: "#08111d",
  fontWeight: 500,
};

const assistantBubbleStyle: CSSProperties = {
  ...baseBubbleStyle,
  backgroundColor: "#162235",
  color: "#e2e8f0",
  border: "1px solid #24324a",
};

const filterBadgeStyle: CSSProperties = {
  backgroundColor: "#0b1220",
  border: "1px solid #1d4ed8",
  borderRadius: "0.7rem",
  padding: "0.6rem 0.7rem",
  fontSize: "0.82rem",
  color: "#cbd5e1",
};

const errorBarStyle: CSSProperties = {
  backgroundColor: "#3b1118",
  color: "#fecaca",
  padding: "0.6rem 1rem",
  fontSize: "0.85rem",
  borderTop: "1px solid #7f1d1d",
};

const inputRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  padding: "0.85rem",
  borderTop: "1px solid #24324a",
  backgroundColor: "#111c30",
};

const textInputStyle: CSSProperties = {
  flex: 1,
  borderRadius: "0.7rem",
  border: "1px solid #334155",
  backgroundColor: "#0b1220",
  color: "#f8fafc",
  padding: "0.65rem 0.8rem",
  fontSize: "0.92rem",
};

function sendButtonStyle(disabled: boolean): CSSProperties {
  return {
    backgroundColor: disabled ? "#1e293b" : "#0ea5e9",
    color: disabled ? "#94a3b8" : "#08111d",
    border: "none",
    borderRadius: "0.7rem",
    padding: "0.65rem 1rem",
    fontSize: "0.92rem",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function applyButtonStyle(disabled: boolean): CSSProperties {
  return {
    marginTop: "0.55rem",
    backgroundColor: disabled ? "#1e293b" : "#1d4ed8",
    color: disabled ? "#94a3b8" : "#f8fafc",
    border: "none",
    borderRadius: "0.6rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const launcherStyle: CSSProperties = {
  backgroundColor: "#0ea5e9",
  color: "#08111d",
  border: "none",
  borderRadius: "999px",
  padding: "0.85rem 1.4rem",
  fontSize: "0.95rem",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(14, 165, 233, 0.35)",
};
