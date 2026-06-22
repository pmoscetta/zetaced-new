import AppShell from "../AppShell";
import PageSection from "../PageSection";

export default function AlarmsPage() {
  return (
    <AppShell
      title="Log / Alarms"
      description="This route will surface the first records from `dv_zetaced_message` once the alarms endpoint is added."
    >
      <PageSection
        title="Alarm Feed Placeholder"
        description="The page is already protected and connected to the shared workspace chrome, so the next step is wiring the alarm table to the backend."
      >
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
          }}
        >
          {["Date", "Time", "Message"].map((label) => (
            <div
              key={label}
              style={{
                backgroundColor: "#0b1220",
                border: "1px solid #24324a",
                borderRadius: "0.8rem",
                padding: "0.95rem 1rem",
                color: "#cbd5e1",
              }}
            >
              {label} column placeholder
            </div>
          ))}
        </div>
      </PageSection>
    </AppShell>
  );
}
