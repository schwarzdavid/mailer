import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { PUBLIC_KEY, Public } from './Public'

describe('Public', () => {
    it('flags the decorated handler with the public metadata key', () => {
        class Controller {
            @Public()
            handler(this: void) {}
        }

        expect(Reflect.getMetadata(PUBLIC_KEY, Controller.prototype.handler)).toBe(true)
    })

    it('flags a decorated class with the public metadata key', () => {
        @Public()
        class Controller {}

        expect(Reflect.getMetadata(PUBLIC_KEY, Controller)).toBe(true)
    })
})
