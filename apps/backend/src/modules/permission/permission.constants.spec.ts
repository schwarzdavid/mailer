import { GLOBAL_PERMISSIONS } from './permission.constants.js'

describe('GLOBAL_PERMISSIONS', () => {
    it('does not define a block permission for bounces', () => {
        expect(GLOBAL_PERMISSIONS).not.toContain('bounces.block')
        expect(GLOBAL_PERMISSIONS.filter((permission) => permission.startsWith('bounces.'))).toEqual([
            'bounces.read',
            'bounces.unblock',
        ])
    })
})
