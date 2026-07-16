<template>
    <form novalidate @submit.prevent="onSubmit">
        <VTextField
            v-model="fqdn"
            name="fqdn"
            :label="t('field.domain')"
            placeholder="email.example.com"
            :error-messages="errors.fqdn"
        />
        <VTextField
            v-model="serverIpv4"
            name="serverIpv4"
            :label="t('field.serverIpv4')"
            placeholder="203.0.113.10"
            :error-messages="errors.serverIpv4"
        />
        <VTextField
            v-model="serverIpv6"
            name="serverIpv6"
            :label="t('field.serverIpv6')"
            placeholder="2001:db8::1"
            :error-messages="errors.serverIpv6"
        />
        <div class="d-flex justify-end">
            <VBtn type="submit" :text="t('cta.save')" :loading="isPending" />
        </div>
    </form>
</template>

<script lang="ts" setup>
    import { useForm } from 'vee-validate'
    import { toTypedSchema } from '@vee-validate/zod'
    import { z } from 'zod'
    import { parse } from 'tldts'
    import { useI18n } from 'vue-i18n'
    import type { SendingDomainDto } from 'api'
    import { useSendingDomainMutation } from '@/modules/settings/mutations/useSendingDomainMutation.ts'

    const props = defineProps<{
        sendingDomain?: SendingDomainDto | null
    }>()

    const emit = defineEmits<{
        saved: [sendingDomain: SendingDomainDto]
    }>()

    const { t } = useI18n()
    const { mutateAsync, isPending } = useSendingDomainMutation()

    const { defineField, handleSubmit, errors } = useForm({
        validationSchema: toTypedSchema(
            z.object({
                fqdn: z.string().and(
                    z.custom(
                        (value) => {
                            const { isIcann } = parse(value as string)
                            return !!isIcann
                        },
                        {
                            error: t('validation.hostname'),
                        },
                    ),
                ),
                serverIpv4: z.ipv4(),
                serverIpv6: z.ipv6().optional().or(z.literal('')),
            }),
        ),
        initialValues: {
            fqdn: props.sendingDomain?.fqdn ?? '',
            serverIpv4: props.sendingDomain?.serverIpv4 ?? '',
            serverIpv6: props.sendingDomain?.serverIpv6 ?? '',
        },
    })

    const [fqdn] = defineField('fqdn')
    const [serverIpv4] = defineField('serverIpv4')
    const [serverIpv6] = defineField('serverIpv6')

    const onSubmit = handleSubmit(async (values) => {
        const sendingDomain = await mutateAsync({
            fqdn: values.fqdn,
            serverIpv4: values.serverIpv4,
            serverIpv6: values.serverIpv6 || undefined,
        })
        emit('saved', sendingDomain)
    })
</script>
