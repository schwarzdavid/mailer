export interface MxRecordValue {
    priority: number
    exchange: string
}

const MX_RECORD_VALUE_PATTERN = /^(\d+)\s+(\S+)$/

export function formatMxRecordValue({ priority, exchange }: MxRecordValue): string {
    return `${priority} ${exchange}`
}

export function parseMxRecordValue(value: string): MxRecordValue | null {
    const match = MX_RECORD_VALUE_PATTERN.exec(value)
    if (!match?.[1] || !match[2]) {
        return null
    }
    return { priority: Number(match[1]), exchange: match[2] }
}
