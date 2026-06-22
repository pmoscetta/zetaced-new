"use client";

import { getApiBaseUrl } from "./api";
import { clearStoredSession, getStoredSession } from "./auth-storage";

const apiBaseUrl = getApiBaseUrl();

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

  const payload = (await response.json()) as T | { detail?: string };
  if (!response.ok) {
    const errorPayload = payload as { detail?: string };
    if (errorPayload.detail) {
      throw new Error(errorPayload.detail);
    }
    throw new Error("Request failed.");
  }

  return payload as T;
}
