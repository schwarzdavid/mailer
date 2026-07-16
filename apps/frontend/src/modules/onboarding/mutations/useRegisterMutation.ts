import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { SetupApi, type RegisterUserDto, type SetupStatusDto } from 'api'
import { useLocalStorage } from '@vueuse/core'
import { JWT_KEY } from '@/constants/jwtKey.ts'

export function useRegisterMutation() {
    const client = useQueryClient()
    const jwt = useLocalStorage<string | null>(JWT_KEY, null)

    return useMutation({
        mutationFn: (registration: RegisterUserDto) =>
            SetupApi.registerUser({
                body: registration,
            }),
        onSuccess({ user, token }) {
            jwt.value = token
            client.setQueryData(['auth.user'], user)
            client.setQueryData(['setup.status'], { needsSetup: false } satisfies SetupStatusDto)
        },
    })
}
