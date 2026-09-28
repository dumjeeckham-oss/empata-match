import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initializeEventFormAppCheck } from "@/lib/appCheck";

initializeEventFormAppCheck();

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
