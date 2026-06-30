<template>
    <VMain class="bg-primary d-flex align-center justify-center">
        <VCard elevation="1" width="500" max-width="calc(100% - 32px)">
            <VCardText>
                <RouterView />
            </VCardText>
        </VCard>
        <VFooter app color="transparent" border="t">
            Copyright &copy; 2026 David Schwarz IT Services GmbH
        </VFooter>
    </VMain>
</template>
