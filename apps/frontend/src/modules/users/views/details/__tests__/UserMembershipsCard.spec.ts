import { describe, expect, it } from 'vitest'
import UserMembershipsCard from '../partials/UserMembershipsCard.vue'
import { mountView } from '@/__tests__/support.ts'
import { userDetail } from '../../__tests__/userFixtures.ts'

describe('UserMembershipsCard', () => {
    it('lists each project with its role and extra permissions', () => {
        const wrapper = mountView(UserMembershipsCard, { props: { user: userDetail() } })

        expect(wrapper.text()).toContain('Acme Website')
        const tags = wrapper.findAll('.tag-label').map((tag) => tag.text())
        expect(tags).toEqual(['Maintainer', 'Delete project'])
    })

    it('shows the empty state without memberships', () => {
        const wrapper = mountView(UserMembershipsCard, { props: { user: userDetail({ memberships: [] }) } })

        expect(wrapper.text()).toContain('No project memberships')
        expect(wrapper.text()).not.toContain('Acme Website')
    })
})
