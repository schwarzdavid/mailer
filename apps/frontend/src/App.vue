<script setup lang="ts"></script>

<template>
  <VApp>
      <RouterView v-slot="{Component}">
          <component :is="Component" v-if="Component"/>
          <VMain v-else>
              <VProgressCircular indeterminate size="64"/>
          </VMain>
      </RouterView>
  </VApp>
</template>

<style scoped></style>
