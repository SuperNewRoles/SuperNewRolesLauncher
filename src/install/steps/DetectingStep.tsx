import type { MessageKey } from "../../i18n";

interface DetectingStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

export default function DetectingStep({ t }: DetectingStepProps) {
  // 検出ステップは中央寄せでローディング専用 UI を表示する。
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
        // 既存共通スピナーを大きめサイズで再利用して待機中を強調する。
        style={{ width: "48px", height: "48px", borderWidth: "5px", marginBottom: "24px" }}
      />
      <p style={{ fontSize: "1.4rem", color: "var(--text)", margin: 0 }}>{t("detect.loading")}</p>
    </div>
  );
}
