import { expandAbbreviation } from 'emmet-monaco-es'

const HTML_TAGS = new Set(
    (
        'a abbr address article aside b blockquote body br button caption center code col colgroup dd del details div dl dt em ' +
        'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hr html i img input label legend li link main ' +
        'mark meta nav ol optgroup option p pre q s section select small source span strong style sub summary sup table ' +
        'tbody td textarea tfoot th thead time title tr u ul'
    ).split(' '),
)

const ABBREVIATION = /(?:^|[\s>}])([a-zA-Z!][\w.#>+*^$@:\-[\]()]*(?:\{[^{}]*\})?)$/

export interface EmmetExpansion {
    abbreviation: string
    expansion: string
}

export function expandEmmet(textBeforeCursor: string): EmmetExpansion | null {
    const abbreviation = ABBREVIATION.exec(textBeforeCursor)?.[1]
    if (!abbreviation) {
        return null
    }
    const leadingTag = /^[a-zA-Z][\w-]*/.exec(abbreviation)?.[0]?.toLowerCase()
    const hasOperators = /[>+*^.#[{]/.test(abbreviation)
    if (abbreviation !== '!' && !hasOperators && !(leadingTag && HTML_TAGS.has(leadingTag))) {
        return null
    }
    try {
        const expansion = expandAbbreviation(abbreviation, { type: 'markup', syntax: 'html' })
        return expansion ? { abbreviation, expansion } : null
    } catch {
        return null
    }
}
