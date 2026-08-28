import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Auto-register and update service worker in background
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log("Mailnex update available — auto updating...");
  },
  onOfflineReady() {
    console.log("Mailnex is ready for offline/mobile standalone use.");
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
