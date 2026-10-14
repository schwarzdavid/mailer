import { useI18n } from 'vue-i18n'

export function useRequiredLabel() {
    const { t } = useI18n()

    return (label: string) => t('field.required', { label })
}
