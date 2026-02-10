import type { MessageKey } from "../../i18n";

interface DetectingStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

export default function DetectingStep({ t }: DetectingStepProps) {
  return (
    <div
      className="install-step install-step-detecting"
      style={{
        textAlign: "center",
        justifyContent: "center",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px",
      }}
    >
      <div
        className="spinner"
        style={{ width: "48px", height: "48px", borderWidth: "5px", marginBottom: "24px" }}
      />
      <p style={{ fontSize: "1.4rem", color: "var(--text)", margin: 0 }}>{t("detect.loading")}</p>
    </div>
  );
}
