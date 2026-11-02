import { DomainDnsRecordIssue, DomainDnsRecordStatus, DomainDnsRecordUse } from '../interfaces/domain-dns.interface.js'

export interface RecordEvaluation {
    status: DomainDnsRecordStatus
    current: string | null
    issue: DomainDnsRecordIssue | null
}

const SPF_RECORD_PATTERN = /^v=spf1(\s|$)/i
const SPF_ALL_TERM_PATTERN = /^[-~+?]?all$/i
const DMARC_RECORD_PATTERN = /^v=DMARC1(\s*;|$)/i
const DMARC_POLICY_PATTERN = /(^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(;|$)/i

const valid = (current: string): RecordEvaluation => ({
    status: DomainDnsRecordStatus.VALID,
    current,
    issue: null,
})

const invalid = (current: string | null, issue: DomainDnsRecordIssue): RecordEvaluation => ({
    status: DomainDnsRecordStatus.INVALID,
    current,
    issue,
})

const evaluateSingleRecord = (
    resolved: string[],
    recordPattern: RegExp,
    isComplete: (record: string) => boolean,
): RecordEvaluation => {
    const [first, ...others] = resolved.filter((value) => recordPattern.test(value))

    if (first === undefined) {
        return invalid(resolved[0] ?? null, DomainDnsRecordIssue.MISSING)
    }
    if (others.length > 0) {
        return invalid(first, DomainDnsRecordIssue.MULTIPLE)
    }
    return isComplete(first) ? valid(first) : invalid(first, DomainDnsRecordIssue.INCOMPLETE)
}

const spfTerms = (record: string): string[] => record.toLowerCase().split(/\s+/).filter(Boolean)

export function evaluateExactRecord(expected: string, resolved: string[]): RecordEvaluation {
    if (resolved.includes(expected)) {
        return valid(expected)
    }
    if (resolved.length === 0) {
        return invalid(null, DomainDnsRecordIssue.MISSING)
    }
    return invalid(resolved[0] ?? null, DomainDnsRecordIssue.MISMATCH)
}

export function evaluateSpfRecord(expected: string, resolved: string[]): RecordEvaluation {
    const requiredTerms = spfTerms(expected)
        .slice(1)
        .filter((term) => !SPF_ALL_TERM_PATTERN.test(term))

    return evaluateSingleRecord(resolved, SPF_RECORD_PATTERN, (record) => {
        const terms = new Set(spfTerms(record))
        return requiredTerms.every((term) => terms.has(term))
    })
}

export function evaluateDmarcRecord(_expected: string, resolved: string[]): RecordEvaluation {
    return evaluateSingleRecord(resolved, DMARC_RECORD_PATTERN, (record) => DMARC_POLICY_PATTERN.test(record))
}

export function evaluateRecord(use: DomainDnsRecordUse, expected: string, resolved: string[]): RecordEvaluation {
    switch (use) {
        case DomainDnsRecordUse.SPF:
            return evaluateSpfRecord(expected, resolved)
        case DomainDnsRecordUse.DMARC:
            return evaluateDmarcRecord(expected, resolved)
        default:
            return evaluateExactRecord(expected, resolved)
    }
}
