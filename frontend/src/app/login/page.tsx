"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getApiBaseUrl } from "../api";
import { getStoredSession, storeSession } from "../auth-storage";

type LoginResponse = {
  access_token: string;
  token_type: string;
  client_name: string;
  user_level: number;
};

type ErrorResponse = {
  detail?: string;
};

const apiBaseUrl = getApiBaseUrl();

export default function LoginPage() {
  const router = useRouter();
  const [clientSlug, setClientSlug] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const existingSession = getStoredSession();

    if (existingSession) {
      router.replace("/map");
    }
  }, [router]);

  const submitDisabled = useMemo(() => {
    return (
      isSubmitting ||
      clientSlug.trim().length === 0 ||
      username.trim().length === 0 ||
      password.length === 0
    );
  }, [clientSlug, username, password, isSubmitting]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_slug: clientSlug.trim(),
          username: username.trim(),
          password,
        }),
      });

      const payload = (await response.json()) as LoginResponse | ErrorResponse;
      if (!response.ok) {
        const errorPayload = payload as ErrorResponse;
        throw new Error(errorPayload.detail || "Login failed.");
      }

      const successPayload = payload as LoginResponse;
      const normalizedClientSlug = clientSlug.trim();
      const normalizedUsername = username.trim();

      storeSession({
        accessToken: successPayload.access_token,
        tokenType: successPayload.token_type,
        clientName: successPayload.client_name,
        clientSlug: normalizedClientSlug,
        username: normalizedUsername,
        userLevel: successPayload.user_level,
      });

      setSuccess(`Login successful for ${successPayload.client_name}. Opening map...`);
      setPassword("");
      router.push("/map");
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Login failed.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "28rem",
          backgroundColor: "#111c30",
          border: "1px solid #24324a",
          borderRadius: "1rem",
          padding: "2rem",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#38bdf8",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontSize: "0.875rem",
          }}
        >
          zetaced.systea.cloud
        </p>
        <h1
          style={{
            marginTop: "0.75rem",
            marginBottom: "0.5rem",
            fontSize: "2rem",
          }}
        >
          Environmental Monitoring
        </h1>
        <p
          style={{
            marginTop: 0,
            marginBottom: "1.75rem",
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}
        >
          Sign in with the client database name, username, and password from the
          legacy platform.
        </p>
        <p
          style={{
            marginTop: 0,
            marginBottom: "1.5rem",
            color: "#94a3b8",
            lineHeight: 1.6,
            fontSize: "0.95rem",
          }}
        >
          After login, the app opens the protected monitoring workspace and keeps
          the session in local storage for navigation between pages.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "1rem",
          }}
        >
          <Field
            label="Client"
            value={clientSlug}
            onChange={setClientSlug}
            placeholder="database"
            autoComplete="organization"
          />
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            placeholder="operator"
            autoComplete="username"
          />
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            type="password"
            autoComplete="current-password"
          />

          {error ? (
            <StatusBox background="#3b1118" border="#7f1d1d" color="#fecaca" text={error} />
          ) : null}

          {success ? (
            <StatusBox
              background="#052e1b"
              border="#166534"
              color="#bbf7d0"
              text={success}
            />
          ) : null}

          <button
            type="submit"
            disabled={submitDisabled}
            style={{
              marginTop: "0.25rem",
              backgroundColor: submitDisabled ? "#1e293b" : "#0ea5e9",
              color: submitDisabled ? "#94a3b8" : "#08111d",
              border: "none",
              borderRadius: "0.75rem",
              padding: "0.9rem 1rem",
              fontSize: "1rem",
              fontWeight: 700,
              cursor: submitDisabled ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: FieldProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: "0.45rem",
      }}
    >
      <span
        style={{
          fontSize: "0.95rem",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
        style={{
          borderRadius: "0.75rem",
          border: "1px solid #334155",
          backgroundColor: "#0b1220",
          color: "#f8fafc",
          padding: "0.9rem 1rem",
          fontSize: "1rem",
          outline: "none",
        }}
      />
    </label>
  );
}

type StatusBoxProps = {
  background: string;
  border: string;
  color: string;
  text: string;
};

function StatusBox({ background, border, color, text }: StatusBoxProps) {
  return (
    <div
      style={{
        backgroundColor: background,
        border: `1px solid ${border}`,
        color,
        borderRadius: "0.75rem",
        padding: "0.85rem 1rem",
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  );
}
