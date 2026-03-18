import { createRoot } from "react-dom/client";
import { LogtoProvider, UserScope } from "@logto/react";
import type { LogtoConfig } from "@logto/react";
import App from "./App";

const logtoConfig: LogtoConfig = {
  endpoint: import.meta.env.VITE_LOGTO_ENDPOINT || "",
  appId: import.meta.env.VITE_LOGTO_APP_ID || "",
  scopes: [UserScope.Identities, UserScope.Email],
};

createRoot(document.getElementById("root")!).render(
  <LogtoProvider config={logtoConfig}>
    <App />
  </LogtoProvider>
);
