import type { NestApplicationOptions } from '@nestjs/common'

export const appOptions: NestApplicationOptions = {
    routeResolutionStrategy: 'specificity',
    routeConflictPolicy: {
        duplicate: 'error',
    },
    return503OnClosing: true,
}
