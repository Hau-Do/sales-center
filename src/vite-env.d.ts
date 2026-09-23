/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Set to '1' only by the e2e npm scripts. Gates the test-only MSW handlers
   * and the window.__testHooks surface.
   *
   * Deliberately NOT `import.meta.env.PROD`: CI runs E2E against a real
   * production preview build, where PROD is true — gating on PROD would make
   * the test routes exist locally and vanish in CI.
   */
  readonly VITE_E2E?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
