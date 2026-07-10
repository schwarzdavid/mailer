export function waitAtleast<T>(fn: Promise<T>, ms = 1000): Promise<T> {
    return Promise.all([fn, timeout(ms)]).then(([result]) => result)
}

function timeout(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}
