import { useI18n } from 'vue-i18n'
import type { InboundFormReceiverDto } from 'api'
import type { StatusTone } from '@/components/statusTone.ts'

export function needsTemplate(receiver: Pick<InboundFormReceiverDto, 'isActive' | 'publishedVersion'>): boolean {
    return receiver.isActive && receiver.publishedVersion === null
}

export function useReceiverStatus() {
    const { t } = useI18n()

    function templateBadge(receiver: Pick<InboundFormReceiverDto, 'draftVersion' | 'publishedVersion'>): {
        tone: StatusTone
        label: string
    } {
        if (receiver.draftVersion !== null && receiver.draftVersion > (receiver.publishedVersion ?? 0)) {
            return { tone: 'info', label: t('status.draft', { version: receiver.draftVersion }) }
        }
        if (receiver.publishedVersion !== null) {
            return { tone: 'success', label: t('status.published', { version: receiver.publishedVersion }) }
        }
        return { tone: 'warning', label: t('status.noTemplate') }
    }

    function activityBadge(isActive: boolean): { tone: StatusTone; label: string } {
        return isActive
            ? { tone: 'success', label: t('status.active') }
            : { tone: 'neutral', label: t('status.inactive') }
    }

    return { templateBadge, activityBadge }
}
