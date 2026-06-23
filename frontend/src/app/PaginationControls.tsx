"use client";

import type { CSSProperties } from "react";

type PaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  summary: string;
  onPrevious: () => void;
  onNext: () => void;
};

export default function PaginationControls({
  currentPage,
  totalPages,
  summary,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <span
        style={{
          color: "#94a3b8",
          fontSize: "0.95rem",
        }}
      >
        {summary}
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <button
          type="button"
          onClick={onPrevious}
          disabled={currentPage <= 1}
          style={pagerButtonStyle(currentPage <= 1)}
        >
          ← Previous
        </button>
        <span
          style={{
            color: "#cbd5e1",
            minWidth: "6.5rem",
            textAlign: "center",
            fontSize: "0.95rem",
          }}
        >
          Page {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={currentPage >= totalPages}
          style={pagerButtonStyle(currentPage >= totalPages)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function pagerButtonStyle(disabled: boolean): CSSProperties {
  return {
    backgroundColor: disabled ? "#1e293b" : "#162235",
    color: disabled ? "#64748b" : "#f8fafc",
    border: "1px solid #334155",
    borderRadius: "0.7rem",
    padding: "0.65rem 0.9rem",
    fontSize: "0.95rem",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
