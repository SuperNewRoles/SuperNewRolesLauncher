export type LaunchErrorMessageKey =
  | "installFlow.invalidAmongUsFolder"
  | "launch.errorEpicAuthRequired"
  | "launch.errorEpicAuthCheckFailed"
  | "launch.errorEpicAuthCheckFailedWithDetail"
  | "launch.errorEpicFeatureDisabled"
  | "launch.errorEpicAuthInitFailed"
  | "launch.errorEpicAuthInitFailedWithDetail";

type Translator = (key: LaunchErrorMessageKey, params?: Record<string, string | number>) => string;

const EPIC_AUTH_REQUIRED_ERROR_PREFIX = "Epic launch requires Epic authentication";
const EPIC_AUTH_CHECK_FAILED_ERROR_PREFIX =
  "Epic authentication check failed. Please log in to Epic and try again:";
const EPIC_AUTH_INIT_FAILED_ERROR_PREFIX = "Failed to initialize Epic authentication:";
const EPIC_FEATURE_DISABLED_ERROR_PREFIX = "Epic launch is disabled by mod.config.json.";
const INVALID_AMONG_US_FOLDER_ERROR_PREFIX =
  "The selected folder is not an Among Us installation directory:";

export function normalizeInvokeErrorMessage(error: unknown): string {
  const message = String(error ?? "").trim();
  return message.replace(/^Error invoking '[^']+':\s*/u, "").trim();
}

export function localizeLaunchErrorMessage(
  error: unknown,
  amongUsExe: string,
  t: Translator,
): string {
  const message = normalizeInvokeErrorMessage(error);
  const invalidAmongUsExeTargetErrorPrefix = `Launch target is not ${amongUsExe}:`;

  if (message.startsWith(EPIC_AUTH_REQUIRED_ERROR_PREFIX)) {
    return t("launch.errorEpicAuthRequired");
  }

  if (message.startsWith(EPIC_AUTH_CHECK_FAILED_ERROR_PREFIX)) {
    const detail = message.slice(EPIC_AUTH_CHECK_FAILED_ERROR_PREFIX.length).trim();
    if (detail.length > 0) {
      return t("launch.errorEpicAuthCheckFailedWithDetail", { error: detail });
    }
    return t("launch.errorEpicAuthCheckFailed");
  }

  if (message.startsWith(EPIC_AUTH_INIT_FAILED_ERROR_PREFIX)) {
    const detail = message.slice(EPIC_AUTH_INIT_FAILED_ERROR_PREFIX.length).trim();
    if (detail.length > 0) {
      return t("launch.errorEpicAuthInitFailedWithDetail", { error: detail });
    }
    return t("launch.errorEpicAuthInitFailed");
  }

  if (message.startsWith(EPIC_FEATURE_DISABLED_ERROR_PREFIX)) {
    return t("launch.errorEpicFeatureDisabled");
  }

  if (
    message.startsWith(INVALID_AMONG_US_FOLDER_ERROR_PREFIX) ||
    message.startsWith(invalidAmongUsExeTargetErrorPrefix)
  ) {
    return t("installFlow.invalidAmongUsFolder");
  }

  return message;
}
