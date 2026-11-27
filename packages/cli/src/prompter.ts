import { confirm, isCancel, note, select, text } from '@clack/prompts'
import { CliError } from './errors.ts'

export interface Prompter {
    text(options: {
        message: string
        initial?: string
        validate?: (value: string) => string | undefined
    }): Promise<string>
    select<T extends string>(options: {
        message: string
        options: { value: T; label: string }[]
        initial?: T
    }): Promise<T>
    confirm(options: { message: string; initial: boolean }): Promise<boolean>
    note(message: string): void
}

function answered<T>(answer: T | symbol): T {
    if (isCancel(answer)) {
        throw new CliError('Setup cancelled.')
    }
    return answer as T
}

export function createClackPrompter(): Prompter {
    return {
        async text(options) {
            return answered<string>(
                await text({
                    message: options.message,
                    initialValue: options.initial,
                    validate: (value) => options.validate?.(value ?? ''),
                }),
            )
        },
        async select<T extends string>(options: {
            message: string
            options: { value: T; label: string }[]
            initial?: T
        }) {
            const choice = await select<string>({
                message: options.message,
                options: options.options,
                initialValue: options.initial,
            })
            return answered<string>(choice) as T
        },
        async confirm(options) {
            return answered<boolean>(await confirm({ message: options.message, initialValue: options.initial }))
        },
        note(message) {
            note(message)
        },
    }
}
