import "./styles.css";
import { runApp } from "./app/bootstrap";

// エントリポイントは初期化呼び出しだけを担当する。
// 実ロジックは app/bootstrap.ts 側に集約済み。
void runApp();
