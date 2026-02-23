export type LaunchErrorMessageKey =
  | "installFlow.invalidAmongUsFolder"
  | "launch.errorEpicAuthRequired"
  | "launch.errorEpicAuthCheckFailed"
  | "launch.errorEpicAuthCheckFailedWithDetail"
  | "launch.errorEpicFeatureDisabled"
  | "launch.errorEpicAuthInitFailed"
  | "launch.errorEpicAuthInitFailedWithDetail"
  | "launch.errorBepInExIl2CppDllMissing"
  | "launch.errorElevationRequired"
  | "launch.errorElevationCancelled"
  | "launch.errorElevatedLaunchFailed";

type Translator = (key: LaunchErrorMessageKey, params?: Record<string, string | number>) => string;

const EPIC_AUTH_REQUIRED_ERROR_PREFIX = "Epic launch requires Epic authentication";
const EPIC_AUTH_CHECK_FAILED_ERROR_PREFIX =
  "Epic authentication check failed. Please log in to Epic and try again:";
const EPIC_AUTH_INIT_FAILED_ERROR_PREFIX = "Failed to initialize Epic authentication:";
const EPIC_FEATURE_DISABLED_ERROR_PREFIX = "Epic launch is disabled by mod.config.json.";
const BEPINEX_IL2CPP_DLL_NOT_FOUND_ERROR_PREFIX = "BepInEx IL2CPP DLL not found:";
const INVALID_AMONG_US_FOLDER_ERROR_PREFIX =
  "The selected folder is not an Among Us installation directory:";
const ELEVATION_REQUIRED_ERROR_PREFIX = "ELEVATION_REQUIRED:";
const ELEVATION_CANCELLED_ERROR_PREFIX = "ELEVATION_CANCELLED:";
const ELEVATED_LAUNCH_FAILED_ERROR_PREFIX = "ELEVATED_LAUNCH_FAILED:";

export function normalizeInvokeErrorMessage(error: unknown): string {
  // Tauri の invoke ラッパーで付与される接頭辞を除去して判定しやすくする。
  const message = String(error ?? "").trim();
  return message.replace(/^Error invoking '[^']+':\s*/u, "").trim();
}

export function isElevationRequiredLaunchError(error: unknown): boolean {
  const message = normalizeInvokeErrorMessage(error);
  return message.startsWith(ELEVATION_REQUIRED_ERROR_PREFIX);
}

export function localizeLaunchErrorMessage(
  error: unknown,
  amongUsExe: string,
  t: Translator,
): string {
  // まずは呼び出しラッパー由来のノイズを取り除く。
  const message = normalizeInvokeErrorMessage(error);
  const invalidAmongUsExeTargetErrorPrefix = `Launch target is not ${amongUsExe}:`;

  if (message.startsWith(EPIC_AUTH_REQUIRED_ERROR_PREFIX)) {
    return t("launch.errorEpicAuthRequired");
  }

  if (message.startsWith(EPIC_AUTH_CHECK_FAILED_ERROR_PREFIX)) {
    // 詳細メッセージがある場合は翻訳文字列へ埋め込んで表示する。
    const detail = message.slice(EPIC_AUTH_CHECK_FAILED_ERROR_PREFIX.length).trim();
    if (detail.length > 0) {
      return t("launch.errorEpicAuthCheckFailedWithDetail", { error: detail });
    }
    return t("launch.errorEpicAuthCheckFailed");
  }

  if (message.startsWith(EPIC_AUTH_INIT_FAILED_ERROR_PREFIX)) {
    // 初期化失敗も詳細があればユーザー向け表示に反映する。
    const detail = message.slice(EPIC_AUTH_INIT_FAILED_ERROR_PREFIX.length).trim();
    if (detail.length > 0) {
      return t("launch.errorEpicAuthInitFailedWithDetail", { error: detail });
    }
    return t("launch.errorEpicAuthInitFailed");
  }

  if (message.startsWith(EPIC_FEATURE_DISABLED_ERROR_PREFIX)) {
    return t("launch.errorEpicFeatureDisabled");
  }

  if (message.startsWith(BEPINEX_IL2CPP_DLL_NOT_FOUND_ERROR_PREFIX)) {
    return t("launch.errorBepInExIl2CppDllMissing");
  }

  if (message.startsWith(ELEVATION_REQUIRED_ERROR_PREFIX)) {
    return t("launch.errorElevationRequired");
  }

  if (message.startsWith(ELEVATION_CANCELLED_ERROR_PREFIX)) {
    return t("launch.errorElevationCancelled");
  }

  if (message.startsWith(ELEVATED_LAUNCH_FAILED_ERROR_PREFIX)) {
    const detail = message.slice(ELEVATED_LAUNCH_FAILED_ERROR_PREFIX.length).trim();
    return t("launch.errorElevatedLaunchFailed", { error: detail || "unknown error" });
  }

  if (
    message.startsWith(INVALID_AMONG_US_FOLDER_ERROR_PREFIX) ||
    message.startsWith(invalidAmongUsExeTargetErrorPrefix)
  ) {
    return t("installFlow.invalidAmongUsFolder");
  }

  // 未知のエラーは情報欠落を避けるため、生文字列のまま返す。
  return message;
}
