import type { EnvFile } from '../env-file.ts'

export interface ProjectMigration {
    from: number
    run(projectDir: string, env: EnvFile): Promise<void>
}

export const projectMigrations: readonly ProjectMigration[] = []
