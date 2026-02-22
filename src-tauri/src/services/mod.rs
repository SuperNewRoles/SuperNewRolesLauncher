//! サービス層モジュール。
//! commands層から業務ロジックを分離し、入出力境界を薄く保つ。
// 実処理の実装はこの配下へ集約する。
// 外部公開するサービスはこのモジュールで明示的に管理する。

pub mod game_server_service;
pub mod launch_service;
pub mod snr_service;
