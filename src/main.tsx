import { StrictMode, useState, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./faithful/App";
import "./faithful/styles.css";
let offerUpdate: () => void = () => {};
const updateSW = registerSW({
  onNeedRefresh() {
    offerUpdate();
  },
  onRegisterError() {
    console.warn(
      "Offline cache registration failed. Keep this app open or reconnect before reloading.",
    );
  },
});
class LocalErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="chooser">
        <h1>Your business could not open</h1>
        <p>
          Your saved records have not been reset. Reload the app and keep this
          browser profile.
        </p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function Root() {
  const [update, setUpdate] = useState(false);
  offerUpdate = () => setUpdate(true);
  return (
    <>
      <LocalErrorBoundary>
        <App />
      </LocalErrorBoundary>
      {update && (
        <div className="update-banner" role="status">
          An app update is ready. Finish any open forms first.
          <button onClick={() => updateSW(true)}>Update & reload</button>
          <button onClick={() => setUpdate(false)}>Later</button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
