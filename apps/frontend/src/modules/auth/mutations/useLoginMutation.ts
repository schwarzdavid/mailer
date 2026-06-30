import { AuthApi, type CredentialsDto } from 'api'
import { useMutation, useQueryClient } from '@tanstack/vue-query'

export function useLoginMutation() {
    const client = useQueryClient()

    return useMutation({
        mutationFn: (credentials: CredentialsDto) =>
            AuthApi.login({
                body: credentials,
            }),
        onSuccess(authentication) {
            client.setQueryData(['auth.user'], authentication.user)
        },
    })
}
