import { AuthApi, type CredentialsDto } from 'api'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { useLocalStorage } from '@vueuse/core'
import { JWT_KEY } from '@/constants/jwtKey.ts'

export function useLoginMutation() {
    const client = useQueryClient()
    const jwt = useLocalStorage<string | null>(JWT_KEY, null)

    return useMutation({
        mutationFn: (credentials: CredentialsDto) =>
            AuthApi.login({
                body: credentials,
            }),
        onSuccess({ user, token }) {
            jwt.value = token
            client.setQueryData(['auth.user'], user)
            client.removeQueries({ queryKey: ['auth.ability'] })
        },
    })
}
