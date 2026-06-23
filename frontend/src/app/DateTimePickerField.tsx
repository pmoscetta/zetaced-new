"use client";

import type { CSSProperties } from "react";

import DatePicker from "react-datepicker";

type DateTimePickerFieldProps = {
  label: string;
  selected: Date | null;
  onChange: (value: Date | null) => void;
};

export default function DateTimePickerField({
  label,
  selected,
  onChange,
}: DateTimePickerFieldProps) {
  return (
    <label
      style={{
        display: "grid",
        gap: "0.45rem",
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <DatePicker
        selected={selected}
        onChange={onChange}
        showTimeSelect
        timeIntervals={5}
        dateFormat="dd/MM/yyyy HH:mm"
        placeholderText="Select date and time"
        className="zetaced-datepicker-input"
        popperClassName="zetaced-datepicker-popper"
        calendarClassName="zetaced-datepicker-calendar"
        wrapperClassName="zetaced-datepicker-wrapper"
      />
    </label>
  );
}

export const datePickerInputStyle: CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid #334155",
  backgroundColor: "#0b1220",
  color: "#f8fafc",
  padding: "0.9rem 1rem",
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
};
