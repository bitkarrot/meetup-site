/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_RELAY: string;
  readonly VITE_READ_RELAY_1: string;
  readonly VITE_READ_RELAY_2: string;
  readonly VITE_READ_RELAY_3: string;
  readonly VITE_PUBLISH_RELAYS: string;
  readonly VITE_TEST_RELAY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
