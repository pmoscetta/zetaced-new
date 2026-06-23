"use client";

import { getApiBaseUrl } from "./api";
import { clearStoredSession, getStoredSession } from "./auth-storage";

const apiBaseUrl = getApiBaseUrl();

type ErrorPayload =
  | { detail?: string | { msg?: string } | Array<{ msg?: string }> }
  | Record<string, unknown>;

export async function fetchProtectedJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const session = getStoredSession();
  if (!session) {
    throw new Error("Missing local session.");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    clearStoredSession();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired.");
  }

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message = extractErrorMessage(payload as ErrorPayload);
    if (message) {
      throw new Error(message);
    }
    throw new Error("Request failed.");
  }

  return payload as T;
}

function extractErrorMessage(payload: ErrorPayload): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = "detail" in payload ? payload.detail : undefined;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        entry && typeof entry === "object" && "msg" in entry && typeof entry.msg === "string"
          ? entry.msg
          : null
      )
      .filter((entry): entry is string => Boolean(entry));

    if (messages.length > 0) {
      return messages.join(" ");
    }
  }

  if (detail && typeof detail === "object" && "msg" in detail && typeof detail.msg === "string") {
    return detail.msg;
  }

  return null;
}
