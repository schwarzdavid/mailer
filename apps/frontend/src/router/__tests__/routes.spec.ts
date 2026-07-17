import { describe, expect, it } from 'vitest'
import { router } from '@/router'
import { RouteNames } from '@/router/RouteNames.ts'

describe('router', () => {
    it('registers a route for every route name', () => {
        for (const name of Object.values(RouteNames)) {
            expect(router.hasRoute(name)).toBe(true)
        }
    })
})
