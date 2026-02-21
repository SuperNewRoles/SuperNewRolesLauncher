fn main() {
    // ここでは追加処理を持たず、ビルド生成処理を tauri_build 側に一本化する。
    // Tauriのビルド時コード生成を実行する。
    tauri_build::build()
}
