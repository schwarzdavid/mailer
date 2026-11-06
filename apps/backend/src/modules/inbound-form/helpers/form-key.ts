import { randomBytes } from 'node:crypto'

const FORM_KEY_BYTES = 16

export const FORM_KEY_LENGTH = 22

export function generateFormKey(): string {
    return randomBytes(FORM_KEY_BYTES).toString('base64url')
}
