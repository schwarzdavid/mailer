import { useQueryClient } from '@tanstack/vue-query'
import { useLocalStorage } from '@vueuse/core'
import { useRouter } from 'vue-router'
import { JWT_KEY } from '@/constants/jwtKey.ts'
import { ability } from '@/plugins/casl.ts'
import { RouteNames } from '@/router/RouteNames.ts'

export function useLogout() {
    const client = useQueryClient()
    const jwt = useLocalStorage<string | null>(JWT_KEY, null, { flush: 'sync' })
    const router = useRouter()

    return function logout() {
        jwt.value = null
        client.removeQueries()
        ability.update([])
        void router.push({ name: RouteNames.LOGIN })
    }
}
