import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { vuetify } from '@/plugins/vuetify.ts'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { queryClient } from '@/plugins/tanstack.ts'
import { i18n } from '@/plugins/i18n.ts'
import { z } from 'zod'
import { client } from 'api/client'
import { JWT_KEY } from '@/constants/jwtKey.ts'

createApp(App)
    .use(router)
    .use(vuetify)
    .use(VueQueryPlugin, {
        queryClient,
    })
    .use(i18n)
    .mount('#app')

z.config({
    customError(issue) {
        const t = i18n.global.t

        if (issue.code === 'invalid_type' || (issue.code === 'too_small' && issue.minimum === 1)) {
            return t('validation.required')
        } else if (issue.code === 'too_small') {
            return t('validation.minLength', { min: issue.minimum })
        } else if (issue.code === 'too_big') {
            return t('validation.maxLength', { max: issue.maximum })
        } else if (issue.code === 'invalid_format') {
            switch (issue.format) {
                case 'email':
                    return t('validation.email')
                case 'hostname':
                    return t('validation.hostname')
                default:
                    if (import.meta.env.DEV) {
                        console.warn('Unmapped format error', issue)
                    }
            }
        }
        if (import.meta.env.DEV) {
            console.warn('Unmapped validation error', issue)
        }
        return t('validation.invalid')
    },
})

client.setConfig({
    baseUrl: location.origin,
    auth(mode) {
        if(mode.type === 'http') {
            return localStorage.getItem(JWT_KEY) ?? undefined
        }
        return undefined
    }
})
