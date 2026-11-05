export const SETUP_LOCK_KEY = 815_002

export const SETUP_STEPS = ['account', 'records', 'finished'] as const

export type SetupStep = (typeof SETUP_STEPS)[number]
