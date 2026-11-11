import { randomBytes } from 'node:crypto'

const FORM_KEY_BYTES = 16

export const FORM_KEY_LENGTH = FORM_KEY_BYTES * 2

export function generateFormKey(): string {
    return randomBytes(FORM_KEY_BYTES).toString('hex')
}

export function normalizeFormKey(formKey: string): string {
    return formKey.toLowerCase()
}
