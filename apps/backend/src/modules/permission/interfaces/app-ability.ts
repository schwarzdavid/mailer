import { ForcedSubject, MongoAbility } from '@casl/ability'

export type AbilityAction = 'manage' | 'read' | 'create' | 'update' | 'delete' | 'block' | 'unblock'

export type AbilitySubjectName = 'Domain' | 'Project' | 'Bounce' | 'Settings' | 'User' | 'Role' | 'all'

interface DomainSubject {
    readonly __typename?: 'Domain'
}

interface ProjectSubject {
    readonly __typename?: 'Project'
    readonly projectId?: number
}

interface BounceSubject {
    readonly __typename?: 'Bounce'
}

interface SettingsSubject {
    readonly __typename?: 'Settings'
}

interface UserSubject {
    readonly __typename?: 'User'
    readonly userId?: number
    readonly role?: { type: string }
}

interface RoleSubject {
    readonly __typename?: 'Role'
}

type AppSubject =
    | DomainSubject
    | ProjectSubject
    | BounceSubject
    | SettingsSubject
    | UserSubject
    | RoleSubject
    | ForcedSubject<AbilitySubjectName>
    | (Record<string, unknown> & ForcedSubject<AbilitySubjectName>)

export type AbilitySubject = AbilitySubjectName | AppSubject

export type AppAbility = MongoAbility<[AbilityAction, AbilitySubject]>
