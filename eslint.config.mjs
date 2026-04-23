// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    ignores: [
      // File generato che embede SQL drizzle (contiene tab originali)
      'server/db/migrations.generated.ts',
      // Migration SQL (drizzle usa tab per default)
      'server/db/migrations/**/*.sql'
    ]
  }
)
