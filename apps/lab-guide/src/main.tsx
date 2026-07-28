import "@fontsource-variable/geist-mono/wght.css";
import "@xyflow/react/dist/style.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import { applyTheme, readStoredTheme } from "./theme";

applyTheme(readStoredTheme());
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
