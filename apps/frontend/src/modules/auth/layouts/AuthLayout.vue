<template>
    <VMain class="bg-primary d-flex align-center justify-center">
        <VCard elevation="1" width="800" max-width="calc(100% - 32px)">
            <RouterView name="full" v-slot="{Component: FullComponent}">
                <component :is="FullComponent" v-if="FullComponent"/>
                <VRow v-else>
                    <VCol cols="6">
                        Icon
                    </VCol>
                    <VCol cols="6">
                        <RouterView v-slot="{route}" name="default">
                            <component :is="route.component"/>
                        </RouterView>
                    </VCol>
                </VRow>
            </RouterView>
        </VCard>
    </VMain>
</template>
