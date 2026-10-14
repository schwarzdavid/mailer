<template>
    <SectionCard :title="t('module.users.details.profile.title')">
        <form v-if="canUpdate" :id="formId" class="form-grid form-grid--2" novalidate @submit.prevent="onSubmit">
            <InlineAlert
                v-if="errorMessage"
                class="span-2"
                tone="error"
                :title="t('module.users.details.profile.error')"
                :text="errorMessage"
            />
            <VTextField
                v-model="firstName"
                name="firstName"
                :label="requiredLabel(t('field.firstName'))"
                :error-messages="errors.firstName"
                aria-required="true"
            />
            <VTextField
                v-model="lastName"
                name="lastName"
                :label="requiredLabel(t('field.lastName'))"
                :error-messages="errors.lastName"
                aria-required="true"
            />
            <VTextField
                v-model="email"
                name="email"
                type="email"
                :label="requiredLabel(t('field.email'))"
                :error-messages="errors.email"
                aria-required="true"
            />
            <PasswordField
                v-model="password"
                name="password"
                :label="t('module.users.details.profile.newPassword')"
                :hint="t('module.users.details.profile.newPasswordHint')"
                persistent-hint
                :error-messages="errors.password"
                autocomplete="new-password"
            />
            <RoleSelect
                v-model="roleId"
                class="span-2"
                :error-messages="errors.roleId"
                :locked="isSelf"
                :locked-hint="t('module.users.details.profile.ownRole')"
                :keep-super-admin="user.role.type === 'super_admin'"
            />
        </form>
        <div v-else class="form-grid form-grid--2">
            <ReadonlyValue :label="t('field.firstName')" :value="user.firstName" />
            <ReadonlyValue :label="t('field.lastName')" :value="user.lastName" />
            <ReadonlyValue :label="t('field.email')" :value="user.email" />
            <ReadonlyValue :label="t('field.role')" :value="roleLabel(user.role)" />
        </div>
        <template v-if="canUpdate" #footer>
            <SaveFooter :form="formId" :dirty="meta.dirty" :pending="isPending" @discard="discard" />
        </template>
    </SectionCard>
</template>

<script setup lang="ts">
    import { ref, useId, watch } from 'vue'
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { useI18n } from 'vue-i18n'
    import type { UserDetailDto } from 'api'
    import InlineAlert from '@/components/InlineAlert.vue'
    import PasswordField from '@/components/PasswordField.vue'
    import ReadonlyValue from '@/components/ReadonlyValue.vue'
    import SaveFooter from '@/components/SaveFooter.vue'
    import SectionCard from '@/components/SectionCard.vue'
    import { useDirtyGuard } from '@/composables/useDirtyGuard.ts'
    import { useNotify } from '@/composables/useNotify.ts'
    import { useRequiredLabel } from '@/composables/useRequiredLabel.ts'
    import { apiErrorMessage } from '@/helper/apiErrorMessage.ts'
    import RoleSelect from '@/modules/users/components/RoleSelect.vue'
    import { useRoleLabels } from '@/modules/users/composables/useRoleLabel.ts'
    import { useUserUpdateMutation } from '@/modules/users/mutations/useUserUpdateMutation.ts'

    const props = defineProps<{ user: UserDetailDto; canUpdate: boolean; isSelf: boolean }>()

    const { t } = useI18n()
    const requiredLabel = useRequiredLabel()
    const roleLabel = useRoleLabels()
    const notify = useNotify()
    const formId = useId()
    const errorMessage = ref<string | null>(null)
    const { mutateAsync, isPending } = useUserUpdateMutation()

    function initialValues(user: UserDetailDto) {
        return {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            password: '',
            roleId: user.role.roleId,
        }
    }

    const { defineField, handleSubmit, errors, meta, resetForm } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                firstName: z.string().trim().min(1),
                lastName: z.string().trim().min(1),
                email: z.email(),
                password: z.string().min(8).optional().or(z.literal('')),
                roleId: z.number(),
            }),
        ),
        initialValues: initialValues(props.user),
    })

    const [firstName] = defineField('firstName')
    const [lastName] = defineField('lastName')
    const [email] = defineField('email')
    const [password] = defineField('password')
    const [roleId] = defineField('roleId')

    useDirtyGuard(() => meta.value.dirty)

    watch(
        () => props.user,
        (user) => {
            if (!meta.value.dirty) {
                resetForm({ values: initialValues(user) })
            }
        },
    )

    function discard() {
        errorMessage.value = null
        resetForm({ values: initialValues(props.user) })
    }

    const onSubmit = handleSubmit(async (values) => {
        errorMessage.value = null
        try {
            await mutateAsync({
                userId: props.user.userId,
                body: {
                    firstName: values.firstName,
                    lastName: values.lastName,
                    email: values.email,
                    ...(props.isSelf ? {} : { roleId: values.roleId }),
                    ...(values.password ? { password: values.password } : {}),
                },
            })
            resetForm({ values: { ...values, password: '' } })
            notify.success(t('module.users.details.profile.saved'))
        } catch (error) {
            errorMessage.value = apiErrorMessage(error, t('dialog.tryAgain'))
        }
    })
</script>
