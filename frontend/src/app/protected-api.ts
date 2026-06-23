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

  const rawBody = await response.text();
  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const message = payload
      ? extractErrorMessage(payload as ErrorPayload)
      : null;
    if (message) {
      throw new Error(message);
    }
    throw new Error(
      `Request failed (${response.status}). ${rawBody.slice(0, 200)}`.trim()
    );
  }

  return payload as T;
}

export async function fetchProtectedBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const session = getStoredSession();
  if (!session) {
    throw new Error("Missing local session.");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (response.status === 401 || response.status === 403) {
    clearStoredSession();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Session expired.");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Export failed (${response.status}). ${text.slice(0, 200)}`.trim());
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";\n]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "export";
  return { blob, filename };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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
