import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: false,
    video: true,
    videosFolder: 'cypress/videos',
    screenshotsFolder: 'cypress/screenshots',
    viewportWidth: 1440,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
    /**
     * Zero retries, deliberately.
     *
     * A retry turns a flake into a pass and hides the defect. If a spec here is
     * unstable that is a bug in the app or in the determinism contract, and it
     * should fail the build so somebody fixes it. The suite can afford this
     * because nothing in it races: the clock is frozen, the dataset is seeded
     * from the URL, and every wait is on the app's own quiescence signal.
     */
    retries: { runMode: 0, openMode: 0 },
    setupNodeEvents(on, config) {
      // axe violations are useless unless you can read them in CI output.
      on('task', {
        a11yReport(violations: unknown) {
          const rows = violations as Array<{
            id: string
            impact: string
            description: string
            nodes: Array<{ target: string[]; failureSummary?: string }>
          }>
          console.log(`\n  ${rows.length} accessibility violation(s):`)
          for (const v of rows) {
            console.log(`   [${v.impact}] ${v.id} — ${v.description}`)
            for (const node of v.nodes.slice(0, 4)) {
              console.log(`      at ${node.target.join(' ')}`)
              if (node.failureSummary) {
                console.log(`      ${node.failureSummary.replace(/\n/g, '\n      ')}`)
              }
            }
          }
          return null
        },
      })
      return config
    },
  },
})
