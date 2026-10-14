import { useI18n } from 'vue-i18n'
import type { InboundFormFieldDto } from 'api'

export function useFieldRules() {
    const { t, n } = useI18n()

    return function rules(field: Pick<InboundFormFieldDto, 'type' | 'validation' | 'defaultValue'>): string[] {
        const validation = field.validation ?? {}
        const parts: string[] = []
        const { minLength, maxLength, min, max, pattern } = validation
        if (minLength !== undefined && maxLength !== undefined) {
            parts.push(t('module.inboundForms.rules.lengthRange', { min: n(minLength), max: n(maxLength) }))
        } else if (minLength !== undefined) {
            parts.push(t('module.inboundForms.rules.minLength', { min: n(minLength) }))
        } else if (maxLength !== undefined) {
            parts.push(t('module.inboundForms.rules.maxLength', { max: n(maxLength) }))
        }
        if (min !== undefined && max !== undefined) {
            parts.push(t('module.inboundForms.rules.range', { min: n(min), max: n(max) }))
        } else if (min !== undefined) {
            parts.push(t('module.inboundForms.rules.min', { min: n(min) }))
        } else if (max !== undefined) {
            parts.push(t('module.inboundForms.rules.max', { max: n(max) }))
        }
        if (pattern) {
            parts.push(t('module.inboundForms.rules.pattern', { pattern }))
        }
        if (field.defaultValue) {
            parts.push(t('module.inboundForms.rules.default', { value: field.defaultValue }))
        }
        return parts
    }
}
