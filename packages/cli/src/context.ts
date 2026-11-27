export interface CliContext {
    projectDir: string
    assetsDir: string
    bakedVersion: string
    env: Record<string, string | undefined>
    interactive: boolean
    out: (line: string) => void
}
