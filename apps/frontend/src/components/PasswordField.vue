<template>
    <VTextField v-model="model" v-bind="$attrs" :type="visible ? 'text' : 'password'">
        <template #append-inner>
            <IconButton
                :icon="visible ? mdiEyeOffOutline : mdiEyeOutline"
                :label="visible ? t('field.hidePassword') : t('field.showPassword')"
                small
                @click="visible = !visible"
            />
        </template>
    </VTextField>
</template>

<script setup lang="ts">
    import { ref } from 'vue'
    import { useI18n } from 'vue-i18n'
    import { mdiEyeOffOutline, mdiEyeOutline } from '@mdi/js'
    import IconButton from '@/components/IconButton.vue'

    defineOptions({ inheritAttrs: false })

    const model = defineModel<string | undefined>()
    const { t } = useI18n()
    const visible = ref(false)
</script>
