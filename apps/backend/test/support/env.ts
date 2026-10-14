import { inject } from 'vitest'

// ConfigModule validates the environment when AppModule is first imported, so the
// container settings must be in process.env before any test file loads the app.
Object.assign(process.env, inject('e2eEnv'))
