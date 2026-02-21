import InstallWizard from "./install/InstallWizard";

// 初回セットアップ画面の描画入口。
function App() {
  // この段階ではインストール導線のみを表示する。
  return (
    // ルート要素の class は将来のレイアウト切替でも固定アンカーとして使う。
    <div className="app-root">
      <InstallWizard />
    </div>
  );
}

export default App;
