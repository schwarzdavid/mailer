import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'

import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { vuetify } from '@/plugins/vuetify.ts'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { queryClient } from '@/plugins/tanstack.ts'

const app = createApp(App)

app.use(router)
app.use(vuetify)
app.use(VueQueryPlugin, {
    queryClient,
})

app.mount('#app')
