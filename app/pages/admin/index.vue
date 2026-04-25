<script setup lang="ts">
// L'index admin redirige al dashboard. Le sub-route /admin/* sono coperte
// dal layout 'admin'. Login e change-password restano standalone.
await navigateTo('/admin/dashboard', { replace: true })
</script>

<template>
  <div />
</template>
