import {useQuery} from "@tanstack/vue-query";
import {login} from '@mailer/api'

export function useAuthQuery() {
    return useQuery({
        queryKey: ['auth.user'],
        queryFn: () => login({
            body: {
                email: '',
                password: ''
            }
        })
    })
}
