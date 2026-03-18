/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOGTO_ENDPOINT: string;
  readonly VITE_LOGTO_APP_ID: string;
  readonly VITE_PORT: string;
  readonly VITE_DEFAULT_WS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
