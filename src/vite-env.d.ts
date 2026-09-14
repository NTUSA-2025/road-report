/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_OUTPUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
