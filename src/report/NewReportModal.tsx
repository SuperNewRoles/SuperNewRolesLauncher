import { useCallback, useState } from "react";
import type { ReportType } from "../app/types";
import type { createTranslator } from "../i18n";

type Translator = ReturnType<typeof createTranslator>;

type Step = "type" | "details" | "confirm";

interface NewReportModalProps {
  t: Translator;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    reportType: ReportType;
    title: string;
    description: string;
    map?: string;
    role?: string;
    timing?: string;
  }) => Promise<void>;
}

const REPORT_TYPES: { type: ReportType; icon: string; color: string }[] = [
  { type: "Bug", icon: "🐛", color: "#e74c3c" },
  { type: "Question", icon: "❓", color: "#3498db" },
  { type: "Request", icon: "💡", color: "#f39c12" },
  { type: "Thanks", icon: "🙏", color: "#27ae60" },
  { type: "Other", icon: "📝", color: "#95a5a6" },
];

export function NewReportModal({ t, isOpen, onClose, onSubmit }: NewReportModalProps) {
  const [step, setStep] = useState<Step>("type");
  const [reportType, setReportType] = useState<ReportType>("Bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [map, setMap] = useState("");
  const [role, setRole] = useState("");
  const [timing, setTiming] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setStep("type");
    setReportType("Bug");
    setTitle("");
    setDescription("");
    setMap("");
    setRole("");
    setTiming("");
  }, []);

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  }, [isSubmitting, resetForm, onClose]);

  const handleTypeSelect = useCallback((type: ReportType) => {
    setReportType(type);
    setStep("details");
  }, []);

  const handleBack = useCallback(() => {
    if (step === "details") {
      setStep("type");
    } else if (step === "confirm") {
      setStep("details");
    }
  }, [step]);

  const handleNext = useCallback(() => {
    if (step === "details" && title.trim() && description.trim()) {
      setStep("confirm");
    }
  }, [step, title, description]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        reportType,
        title: title.trim(),
        description: description.trim(),
        map: map.trim() || undefined,
        role: role.trim() || undefined,
        timing: timing.trim() || undefined,
      });
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  }, [reportType, title, description, map, role, timing, onSubmit, resetForm]);

  if (!isOpen) return null;

  const isBug = reportType === "Bug";
  const canProceed = title.trim() && description.trim();

  return (
    <div className="report-modal-overlay" onClick={handleClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        {/* プログレスバー */}
        <div className="report-wizard-progress">
          <div
            className={`report-wizard-step ${step === "type" ? "active" : ""} ${step === "details" || step === "confirm" ? "completed" : ""}`}
          >
            <span className="report-wizard-step-number">1</span>
            <span className="report-wizard-step-label">{t("report.stepType")}</span>
          </div>
          <div className="report-wizard-step-line" />
          <div
            className={`report-wizard-step ${step === "details" ? "active" : ""} ${step === "confirm" ? "completed" : ""}`}
          >
            <span className="report-wizard-step-number">2</span>
            <span className="report-wizard-step-label">{t("report.stepDetails")}</span>
          </div>
          <div className="report-wizard-step-line" />
          <div className={`report-wizard-step ${step === "confirm" ? "active" : ""}`}>
            <span className="report-wizard-step-number">3</span>
            <span className="report-wizard-step-label">{t("report.stepConfirm")}</span>
          </div>
        </div>

        <div className="report-modal-header">
          <h2>
            {step === "type" && t("report.selectType")}
            {step === "details" && t("report.enterDetails")}
            {step === "confirm" && t("report.confirmReport")}
          </h2>
          <button
            type="button"
            className="report-modal-close"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <div className="report-modal-content">
          {/* ステップ1: 種別選択 */}
          {step === "type" && (
            <div className="report-type-grid">
              {REPORT_TYPES.map(({ type, icon, color }) => (
                <button
                  key={type}
                  type="button"
                  className="report-type-card"
                  onClick={() => handleTypeSelect(type)}
                  style={{ "--type-color": color } as React.CSSProperties}
                >
                  <span className="report-type-icon">{icon}</span>
                  <span className="report-type-name">
                    {t(
                      `report.typeOption.${type.toLowerCase()}` as
                        | "report.typeOption.bug"
                        | "report.typeOption.question"
                        | "report.typeOption.request"
                        | "report.typeOption.thanks"
                        | "report.typeOption.other",
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ステップ2: 詳細入力 */}
          {step === "details" && (
            <>
              <div className="report-form-field">
                <label>{t("report.titleLabel")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("report.titlePlaceholder")}
                  disabled={isSubmitting}
                />
              </div>

              <div className="report-form-field">
                <label>{t("report.body")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("report.bodyPlaceholder")}
                  rows={isBug ? 4 : 6}
                  disabled={isSubmitting}
                />
              </div>

              {/* Bugのみ追加フィールド */}
              {isBug && (
                <>
                  <div className="report-form-row">
                    <div className="report-form-field">
                      <label>{t("report.map")}</label>
                      <input
                        type="text"
                        value={map}
                        onChange={(e) => setMap(e.target.value)}
                        placeholder={t("report.mapPlaceholder")}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className="report-form-field">
                      <label>{t("report.role")}</label>
                      <input
                        type="text"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        placeholder={t("report.rolePlaceholder")}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div className="report-form-field">
                    <label>{t("report.timing")}</label>
                    <input
                      type="text"
                      value={timing}
                      onChange={(e) => setTiming(e.target.value)}
                      placeholder={t("report.timingPlaceholder")}
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* ステップ3: 確認 */}
          {step === "confirm" && (
            <div className="report-confirm-content">
              <div className="report-confirm-item">
                <span className="report-confirm-label">{t("report.type")}</span>
                <span className="report-confirm-value">
                  {REPORT_TYPES.find((t) => t.type === reportType)?.icon}{" "}
                  {t(
                    `report.typeOption.${reportType.toLowerCase()}` as
                      | "report.typeOption.bug"
                      | "report.typeOption.question"
                      | "report.typeOption.request"
                      | "report.typeOption.thanks"
                      | "report.typeOption.other",
                  )}
                </span>
              </div>
              <div className="report-confirm-item">
                <span className="report-confirm-label">{t("report.titleLabel")}</span>
                <span className="report-confirm-value">{title}</span>
              </div>
              <div className="report-confirm-item">
                <span className="report-confirm-label">{t("report.body")}</span>
                <span className="report-confirm-value report-confirm-description">
                  {description}
                </span>
              </div>
              {isBug && map && (
                <div className="report-confirm-item">
                  <span className="report-confirm-label">{t("report.map")}</span>
                  <span className="report-confirm-value">{map}</span>
                </div>
              )}
              {isBug && role && (
                <div className="report-confirm-item">
                  <span className="report-confirm-label">{t("report.role")}</span>
                  <span className="report-confirm-value">{role}</span>
                </div>
              )}
              {isBug && timing && (
                <div className="report-confirm-item">
                  <span className="report-confirm-label">{t("report.timing")}</span>
                  <span className="report-confirm-value">{timing}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="report-modal-footer">
          {step === "type" ? (
            <button
              type="button"
              className="report-btn-secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </button>
          ) : (
            <button
              type="button"
              className="report-btn-secondary"
              onClick={handleBack}
              disabled={isSubmitting}
            >
              {t("common.back")}
            </button>
          )}

          {step === "details" ? (
            <button
              type="button"
              className="report-btn-primary"
              onClick={handleNext}
              disabled={!canProceed || isSubmitting}
            >
              {t("common.next")}
            </button>
          ) : step === "confirm" ? (
            <button
              type="button"
              className="report-btn-primary"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? "..." : t("report.send")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
