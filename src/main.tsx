import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import "./styles/index.css";
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
function Root() {
  const [update, setUpdate] = useState(false);
  offerUpdate = () => setUpdate(true);
  return (
    <>
      <App />
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
