<template>
    <div class="permission-grid">
        <fieldset v-for="(permissions, group) in groups" :key="group" class="permission-grid__group">
            <legend>{{ t(`permissions.groups.${group}`) }}</legend>
            <VCheckbox
                v-for="permission in permissions"
                :key="permission"
                :value="permission"
                :label="t(permissionLabelKey(scope, permission))"
                :model-value="checked"
                :disabled="isDisabled(permission)"
                :messages="hint(permission)"
                hide-details="auto"
                @update:model-value="onChange"
            />
        </fieldset>
    </div>
</template>

<script setup lang="ts" generic="T extends string">
    import { computed } from 'vue'
    import { useI18n } from 'vue-i18n'
    import type { RoleScope } from 'api'
    import { permissionLabelKey } from '@/modules/roles/permissionCatalog.ts'

    const props = withDefaults(
        defineProps<{
            scope: RoleScope
            groups: Record<string, T[]>
            modelValue: T[]
            locked?: T[]
            lockedHint?: string
            grantable?: T[]
            required?: T[]
            readonly?: boolean
        }>(),
        { locked: () => [], lockedHint: undefined, grantable: undefined, required: () => [], readonly: false },
    )

    const emit = defineEmits<{ 'update:modelValue': [value: T[]] }>()

    const { t } = useI18n()

    const checked = computed(() => [...new Set([...props.modelValue, ...props.locked, ...props.required])])

    function isLocked(permission: T) {
        return props.locked.includes(permission)
    }

    function isRequired(permission: T) {
        return props.required.includes(permission)
    }

    function isGrantable(permission: T) {
        return props.grantable === undefined || props.grantable.includes(permission)
    }

    function isDisabled(permission: T) {
        return props.readonly || isLocked(permission) || isRequired(permission) || !isGrantable(permission)
    }

    function hint(permission: T) {
        if (isLocked(permission)) {
            return props.lockedHint
        }
        if (!isRequired(permission) && !isGrantable(permission)) {
            return t('permissions.notHeld')
        }
        return undefined
    }

    function onChange(value: T[] | null) {
        const next = (value ?? []).filter((permission) => !isLocked(permission))
        emit('update:modelValue', [...new Set([...props.required, ...next])])
    }
</script>

<style scoped>
    .permission-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 20px 24px;
    }

    .permission-grid__group {
        margin: 0;
        padding: 0;
        border: 0;
    }

    .permission-grid__group legend {
        margin-bottom: 4px;
        font-size: 0.875rem;
        font-weight: 600;
        line-height: 1.25rem;
    }
</style>
