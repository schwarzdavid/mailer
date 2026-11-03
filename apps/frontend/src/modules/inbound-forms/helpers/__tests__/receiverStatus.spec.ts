import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountView } from '@/__tests__/support.ts'
import { acceptsAnyOrigin, useReceiverStatus } from '../receiverStatus.ts'

function receiverStatus(): ReturnType<typeof useReceiverStatus> {
    let status!: ReturnType<typeof useReceiverStatus>
    mountView(
        defineComponent({
            setup() {
                status = useReceiverStatus()
                return () => null
            },
        }),
    )
    return status
}

describe('acceptsAnyOrigin', () => {
    it('is true for a form without allowed domains', () => {
        expect(acceptsAnyOrigin({ allowedHostnames: [] })).toBe(true)
    })

    it('is false once domains are allowed', () => {
        expect(acceptsAnyOrigin({ allowedHostnames: ['kunde.at'] })).toBe(false)
    })
})

describe('useReceiverStatus', () => {
    it('warns about a form that accepts any origin', () => {
        expect(receiverStatus().openOriginBadge()).toEqual({ tone: 'warning', label: 'Any website' })
    })
})
