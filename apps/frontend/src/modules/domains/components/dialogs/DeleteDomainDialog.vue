<template>
    <VDialog>
        <template #activator="props">
            <slot v-bind="props" />
        </template>
        <VCard> Hi </VCard>
    </VDialog>
</template>
