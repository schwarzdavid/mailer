import {
    InboundFormRecaptchaStoredConfig,
    InboundFormSecurityStoredConfig,
    InboundFormTimedTokenConfig,
} from '../interfaces/inbound-form-security.interface.js'

export function isRecaptchaConfig(
    config: InboundFormSecurityStoredConfig | null,
): config is InboundFormRecaptchaStoredConfig {
    return config !== null && 'encryptedSecret' in config
}

export function isTimedTokenConfig(
    config: InboundFormSecurityStoredConfig | null,
): config is InboundFormTimedTokenConfig {
    return config !== null && 'minDelaySeconds' in config && 'maxAgeSeconds' in config
}
