import { createVuetify } from 'vuetify/framework'

export const vuetify = createVuetify({
    theme: {
        themes: {
            light: {
                colors: {
                    primary: '#ffcf00',
                    background: '#eaeaea',
                },
            },
        },
    },
    defaults: {
        global: {
            rounded: false,
            ripple: false,
            elevation: 0,
        },
        VTextField: {
            variant: 'outlined',
        },
        VTextarea: {
            variant: 'outlined',
        },
        VNumberInput: {
            variant: 'outlined',
        },
        VBtn: {
            color: 'primary',
            size: 'large',
        },
        VAlert: {
            variant: 'tonal',
        },
    },
})
