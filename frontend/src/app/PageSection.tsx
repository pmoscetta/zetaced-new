import type { ReactNode } from "react";

type PageSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export default function PageSection({
  title,
  description,
  children,
}: PageSectionProps) {
  return (
    <section
      style={{
        backgroundColor: "#111c30",
        border: "1px solid #24324a",
        borderRadius: "1rem",
        padding: "1.25rem",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontSize: "1.15rem",
        }}
      >
        {title}
      </h2>
      {description ? (
        <p
          style={{
            margin: "0.65rem 0 0",
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      ) : null}
      <div
        style={{
          marginTop: "1rem",
        }}
      >
        {children}
      </div>
    </section>
  );
}
