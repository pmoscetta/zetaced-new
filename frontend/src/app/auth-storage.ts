export type StoredSession = {
  accessToken: string;
  tokenType: string;
  clientName: string;
  clientSlug: string;
  username: string;
};

const storageKeys = {
  accessToken: "zetaced_access_token",
  tokenType: "zetaced_token_type",
  clientName: "zetaced_client_name",
  clientSlug: "zetaced_client_slug",
  username: "zetaced_username",
} as const;

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = window.localStorage.getItem(storageKeys.accessToken);
  const clientName = window.localStorage.getItem(storageKeys.clientName);
  const clientSlug = window.localStorage.getItem(storageKeys.clientSlug);
  const username = window.localStorage.getItem(storageKeys.username);
  const tokenType =
    window.localStorage.getItem(storageKeys.tokenType) ?? "bearer";

  if (!accessToken || !clientName || !clientSlug || !username) {
    return null;
  }

  return {
    accessToken,
    tokenType,
    clientName,
    clientSlug,
    username,
  };
}

export function storeSession(session: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKeys.accessToken, session.accessToken);
  window.localStorage.setItem(storageKeys.tokenType, session.tokenType);
  window.localStorage.setItem(storageKeys.clientName, session.clientName);
  window.localStorage.setItem(storageKeys.clientSlug, session.clientSlug);
  window.localStorage.setItem(storageKeys.username, session.username);
}

export function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  Object.values(storageKeys).forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
