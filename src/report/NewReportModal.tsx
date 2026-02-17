import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { REPORTING_TERMS_URL } from "../app/modConfig";
import type { ReportType } from "../app/types";
import type { createTranslator } from "../i18n";
import { type ReportModalStep, ReportStepTransition } from "./ReportStepTransition";

type Translator = ReturnType<typeof createTranslator>;
const MODAL_CLOSE_ANIMATION_MS = 220;
const SUBMIT_PROGRESS_MIN_VISIBLE_MS = 400;
const SUBMIT_PROGRESS_SETTLE_TIMEOUT_MS = 250;
type SubmitPhase = "idle" | "sending" | "success" | "error";

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

interface ReportingSendProgressPayload {
  stage: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
}

const REPORT_TYPES: { type: ReportType; icon: string; color: string }[] = [
  { type: "Bug", icon: "🐛", color: "#e74c3c" },
  { type: "Question", icon: "❓", color: "#3498db" },
  { type: "Request", icon: "💡", color: "#f39c12" },
  { type: "Thanks", icon: "🙏", color: "#27ae60" },
  { type: "Other", icon: "📝", color: "#95a5a6" },
];

export function NewReportModal({ t, isOpen, onClose, onSubmit }: NewReportModalProps) {
  const [step, setStep] = useState<ReportModalStep>("type");
  const [reportType, setReportType] = useState<ReportType>("Bug");
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [map, setMap] = useState("");
  const [role, setRole] = useState("");
  const [timing, setTiming] = useState("");
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [submitStage, setSubmitStage] = useState("preparing");
  const [submitProgressTarget, setSubmitProgressTarget] = useState(0);
  const [submitProgressDisplay, setSubmitProgressDisplay] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const closeAnimationTimeoutRef = useRef<number | null>(null);
  const progressAnimationFrameRef = useRef<number | null>(null);
  const submitStartAtRef = useRef(0);
  const submitProgressDisplayRef = useRef(0);
  const isSubmitting = submitPhase === "sending";
  const isSubmitSending = submitPhase === "sending";
  const isSubmitSuccess = submitPhase === "success";
  const isSubmitError = submitPhase === "error";
  const canCloseModal = submitPhase !== "sending";

  const clearCloseAnimationTimeout = useCallback(() => {
    if (closeAnimationTimeoutRef.current !== null) {
      window.clearTimeout(closeAnimationTimeoutRef.current);
      closeAnimationTimeoutRef.current = null;
    }
  }, []);

  const resetSubmitState = useCallback(() => {
    setSubmitPhase("idle");
    setSubmitStage("preparing");
    setSubmitProgressTarget(0);
    setSubmitProgressDisplay(0);
    submitProgressDisplayRef.current = 0;
    setSubmitError(null);
  }, []);

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
    if (canCloseModal) {
      resetSubmitState();
      resetForm();
      onClose();
    }
  }, [canCloseModal, resetSubmitState, resetForm, onClose]);

  const clearProgressAnimationFrame = useCallback(() => {
    if (progressAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(progressAnimationFrameRef.current);
      progressAnimationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      clearCloseAnimationTimeout();
      resetSubmitState();
      setIsRendered(true);
      setIsClosing(false);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return;
    }

    if (!isRendered) {
      return;
    }

    setIsVisible(false);
    setIsClosing(true);
    clearCloseAnimationTimeout();
    closeAnimationTimeoutRef.current = window.setTimeout(() => {
      closeAnimationTimeoutRef.current = null;
      setIsRendered(false);
      setIsClosing(false);
    }, MODAL_CLOSE_ANIMATION_MS);
  }, [isOpen, isRendered, clearCloseAnimationTimeout, resetSubmitState]);

  useEffect(() => {
    return () => {
      clearCloseAnimationTimeout();
      clearProgressAnimationFrame();
    };
  }, [clearCloseAnimationTimeout, clearProgressAnimationFrame]);

  useEffect(() => {
    const unlisten = listen<ReportingSendProgressPayload>("reporting-send-progress", (event) => {
      const stage = String(event.payload.stage || "");
      if (stage.length > 0) {
        setSubmitStage(stage);
      }

      const raw = Number(event.payload.progress);
      if (!Number.isFinite(raw)) {
        return;
      }
      const normalized = stage === "complete" ? 100 : Math.max(0, Math.min(100, raw));
      setSubmitProgressTarget((current) => Math.max(current, normalized));
    });

    return () => {
      void unlisten.then((off) => off());
    };
  }, []);

  useEffect(() => {
    submitProgressDisplayRef.current = submitProgressDisplay;
  }, [submitProgressDisplay]);

  useEffect(() => {
    if (submitPhase !== "sending") {
      clearProgressAnimationFrame();
      return;
    }

    clearProgressAnimationFrame();

    const animate = () => {
      const current = submitProgressDisplayRef.current;
      const target = submitProgressTarget;

      if (target <= current + 0.01) {
        progressAnimationFrameRef.current = null;
        return;
      }

      const diff = target - current;
      const step = Math.min(diff, Math.max(0.12, Math.min(2.4, 0.16 + diff * 0.18)));
      const next = Math.min(target, current + step);
      submitProgressDisplayRef.current = next;
      setSubmitProgressDisplay(next);

      progressAnimationFrameRef.current = window.requestAnimationFrame(animate);
    };

    progressAnimationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      clearProgressAnimationFrame();
    };
  }, [submitPhase, submitProgressTarget, clearProgressAnimationFrame]);

  useEffect(() => {
    if (!isOpen || isSubmitting) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSubmitting, handleClose]);

  const handleTypeSelect = useCallback(
    (type: ReportType) => {
      if (isSubmitting) {
        return;
      }

      setReportType(type);
      setStep("details");
    },
    [isSubmitting],
  );

  const handleBack = useCallback(() => {
    if (step === "details") {
      setStep("type");
    } else if (step === "confirm") {
      setStep("details");
    }
  }, [step]);

  const isBug = reportType === "Bug";
  const hasTitle = title.trim().length > 0;
  const hasDescription = description.trim().length > 0;
  const hasRequiredBugDetails =
    map.trim().length > 0 && role.trim().length > 0 && timing.trim().length > 0;
  const canProceed = hasTitle && hasDescription && (!isBug || hasRequiredBugDetails);

  const handleNext = useCallback(() => {
    if (step === "details" && canProceed) {
      setStep("confirm");
    }
  }, [step, canProceed]);

  const handleSubmit = useCallback(async () => {
    if (!canProceed) return;

    setSubmitError(null);
    setSubmitPhase("sending");
    setSubmitStage("preparing");
    setSubmitProgressTarget(0);
    setSubmitProgressDisplay(0);
    submitProgressDisplayRef.current = 0;
    submitStartAtRef.current = performance.now();
    try {
      await onSubmit({
        reportType,
        title: title.trim(),
        description: description.trim(),
        map: map.trim() || undefined,
        role: role.trim() || undefined,
        timing: timing.trim() || undefined,
      });
      setSubmitStage("complete");
      setSubmitProgressTarget(100);

      const elapsed = performance.now() - submitStartAtRef.current;
      const waitForMinimumVisible = Math.max(0, SUBMIT_PROGRESS_MIN_VISIBLE_MS - elapsed);
      if (waitForMinimumVisible > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, waitForMinimumVisible);
        });
      }

      const settleDeadline = performance.now() + SUBMIT_PROGRESS_SETTLE_TIMEOUT_MS;
      while (submitProgressDisplayRef.current < 99 && performance.now() < settleDeadline) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 16);
        });
      }

      setSubmitProgressDisplay(100);
      submitProgressDisplayRef.current = 100;
      setSubmitPhase("success");
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const cleaned = raw.replace(/^Error invoking '[^']+':\s*/u, "").trim();
      const normalized = cleaned
        .replace(/^Failed to send report:\s*/iu, "")
        .replace(/^報告送信失敗:\s*/u, "")
        .trim();
      setSubmitStage("failed");
      setSubmitPhase("error");
      setSubmitError(normalized.length > 0 ? normalized : cleaned.length > 0 ? cleaned : raw);
    }
  }, [canProceed, reportType, title, description, map, role, timing, onSubmit]);

  const handleOpenTerms = useCallback(async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      await openUrl(REPORTING_TERMS_URL);
    } catch {
      window.open(REPORTING_TERMS_URL, "_blank", "noopener,noreferrer");
    }
  }, []);

  if (!isRendered) return null;

  const submitStatusLabel =
    submitStage === "preparing"
      ? t("report.preparing")
      : submitStage === "processing"
        ? t("report.processing")
        : t("report.sending");

  const closeOnActivation = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClose();
    }
  };

  const stopPropagation = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === " ") {
      event.preventDefault();
    }
    event.stopPropagation();
  };

  const modal = (
    <div
      className={`report-modal-overlay ${isVisible ? "open" : ""} ${isClosing ? "closing" : ""}`}
      onClick={handleClose}
      onKeyDown={closeOnActivation}
      tabIndex={-1}
    >
      <dialog
        className="report-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={stopPropagation}
        aria-label={t("report.enterDetails")}
        aria-modal="true"
        open
      >
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
          <h2 id="report-modal-title">
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

        <ReportStepTransition step={step}>
          {(currentStep) => (
            <div className="report-modal-content">
              {/* ステップ1: 種別選択 */}
              {currentStep === "type" && (
                <div className="report-type-grid">
                  {REPORT_TYPES.map(({ type, icon, color }) => (
                    <button
                      key={type}
                      type="button"
                      className="report-type-card"
                      onClick={() => handleTypeSelect(type)}
                      style={{ "--type-color": color } as React.CSSProperties}
                      disabled={isSubmitting}
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
              {currentStep === "details" && (
                <>
                  <div className="report-form-field">
                    <label htmlFor="report-title-input">{t("report.titleLabel")}</label>
                    <input
                      id="report-title-input"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("report.titlePlaceholder")}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Bugのみ追加フィールド */}
                  {isBug && (
                    <>
                      <div className="report-form-row">
                        <div className="report-form-field">
                          <label htmlFor="report-map-input">{t("report.map")}</label>
                          <input
                            id="report-map-input"
                            type="text"
                            value={map}
                            onChange={(e) => setMap(e.target.value)}
                            placeholder={t("report.mapPlaceholder")}
                            disabled={isSubmitting}
                          />
                        </div>

                        <div className="report-form-field">
                          <label htmlFor="report-role-input">{t("report.role")}</label>
                          <input
                            id="report-role-input"
                            type="text"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            placeholder={t("report.rolePlaceholder")}
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>

                      <div className="report-form-field">
                        <label htmlFor="report-timing-input">{t("report.timing")}</label>
                        <input
                          id="report-timing-input"
                          type="text"
                          value={timing}
                          onChange={(e) => setTiming(e.target.value)}
                          placeholder={t("report.timingPlaceholder")}
                          disabled={isSubmitting}
                        />
                      </div>
                    </>
                  )}

                  <div className="report-form-field">
                    <label htmlFor="report-body-input">{t("report.body")}</label>
                    <textarea
                      id="report-body-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={t("report.bodyPlaceholder")}
                      rows={isBug ? 4 : 6}
                      disabled={isSubmitting}
                    />
                  </div>
                </>
              )}

              {/* ステップ3: 確認 */}
              {currentStep === "confirm" && (
                <div className="report-confirm-content">
                  <div className="report-confirm-grid">
                    <div className="report-confirm-item is-type">
                      <span className="report-confirm-label">{t("report.type")}</span>
                      <span className="report-confirm-value report-confirm-value-strong">
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
                    <div className="report-confirm-item is-title">
                      <span className="report-confirm-label">{t("report.titleLabel")}</span>
                      <span className="report-confirm-value report-confirm-value-strong">
                        {title}
                      </span>
                    </div>
                    {isBug && map && (
                      <div className="report-confirm-item is-meta">
                        <span className="report-confirm-label">{t("report.map")}</span>
                        <span className="report-confirm-value">{map}</span>
                      </div>
                    )}
                    {isBug && role && (
                      <div className="report-confirm-item is-meta">
                        <span className="report-confirm-label">{t("report.role")}</span>
                        <span className="report-confirm-value">{role}</span>
                      </div>
                    )}
                    {isBug && timing && (
                      <div className="report-confirm-item is-meta">
                        <span className="report-confirm-label">{t("report.timing")}</span>
                        <span className="report-confirm-value">{timing}</span>
                      </div>
                    )}
                  </div>
                  <div className="report-confirm-item is-body">
                    <div className="report-confirm-body-head">
                      <span className="report-confirm-label">{t("report.body")}</span>
                    </div>
                    <div className="report-confirm-body-preview">
                      <div className="report-confirm-body-accent" aria-hidden="true" />
                      <div className="report-confirm-value report-confirm-description">
                        {description}
                      </div>
                    </div>
                  </div>
                  <div className="report-confirm-terms">
                    <span className="report-confirm-terms-text">{t("report.termsNotice")}</span>
                    <a
                      className="report-confirm-terms-link"
                      href={REPORTING_TERMS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => {
                        void handleOpenTerms(event);
                      }}
                    >
                      {t("report.termsLink")}
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </ReportStepTransition>

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
      </dialog>
      {submitPhase !== "idle" && (
        <div
          className="report-submit-overlay"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          tabIndex={-1}
          role={isSubmitSuccess || isSubmitError ? "dialog" : "status"}
          aria-live="polite"
          aria-label={
            isSubmitSuccess
              ? t("report.sent")
              : isSubmitError
                ? t("report.sendFailedTitle")
                : submitStatusLabel
          }
          aria-busy={!isSubmitSuccess && !isSubmitError}
        >
          <div
            key={submitPhase}
            className={`report-submit-overlay-content ${isSubmitSending ? "is-sending" : ""} ${isSubmitSuccess ? "is-success" : ""} ${isSubmitError ? "is-error" : ""}`}
          >
            {isSubmitSuccess ? (
              <>
                <div className="report-submit-overlay-success-icon" aria-hidden="true">
                  ✓
                </div>
                <span className="report-submit-overlay-label report-submit-overlay-label-success">
                  {t("report.sent")}
                </span>
                <button
                  type="button"
                  className="report-submit-overlay-close-btn"
                  onClick={handleClose}
                >
                  {t("common.close")}
                </button>
              </>
            ) : isSubmitError ? (
              <>
                <div className="report-submit-overlay-success-icon is-error" aria-hidden="true">
                  !
                </div>
                <span className="report-submit-overlay-label report-submit-overlay-label-success">
                  {t("report.sendFailedTitle")}
                </span>
                <p className="report-submit-overlay-note report-submit-overlay-note-error">
                  {submitError ?? ""}
                </p>
                <button
                  type="button"
                  className="report-submit-overlay-close-btn"
                  onClick={handleClose}
                >
                  {t("common.close")}
                </button>
              </>
            ) : (
              <>
                <div className="report-spinner" aria-hidden="true" />
                <span className="report-submit-overlay-label">{submitStatusLabel}</span>
                <strong className="report-submit-overlay-progress">
                  {Math.round(submitProgressDisplay)}%
                </strong>
                <div className="report-submit-overlay-progress-track" aria-hidden="true">
                  <div
                    className="report-submit-overlay-progress-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, submitProgressDisplay))}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (typeof document === "undefined") {
    return modal;
  }

  return createPortal(modal, document.body);
}
