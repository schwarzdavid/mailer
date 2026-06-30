<template>
    <VMain class="bg-primary d-flex align-center justify-center">
        <VCard elevation="1" width="800" max-width="calc(100% - 32px)">
            <VRow>
                <VCol cols="6"> Icon </VCol>
                <VCol cols="6">
                    <RouterView />
                </VCol>
            </VRow>
        </VCard>
    </VMain>
</template>
