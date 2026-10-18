import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {(import.meta.env.MODE === "staging" ||
      import.meta.env.VITE_STAGING === "true") && (
      <aside className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
        Test ortamı — gerçek sipariş ve ödeme alınmaz. Yalnız örnek veriler
        kullanın.
      </aside>
    )}
    <App />
  </StrictMode>,
);
