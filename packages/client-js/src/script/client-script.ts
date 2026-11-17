import { installInboundForm } from './install.ts'

installInboundForm(
    window as typeof window & { InboundForm?: unknown },
    document.currentScript && (document.currentScript as HTMLScriptElement).src,
)
