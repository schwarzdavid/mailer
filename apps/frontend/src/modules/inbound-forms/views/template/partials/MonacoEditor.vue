<template>
    <div ref="container" class="monaco-container" />
</template>

<script setup lang="ts">
    import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
    import { useTheme } from 'vuetify'
    import * as monaco from 'monaco-editor'
    import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
    import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
    import { expandEmmet } from '@/modules/inbound-forms/helpers/emmetAbbreviation.ts'
    import { closingTagFor } from '@/modules/inbound-forms/helpers/autoCloseTag.ts'
    ;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
            if (label === 'html' || label === 'handlebars') {
                return new HtmlWorker()
            }
            return new EditorWorker()
        },
    }

    const props = withDefaults(
        defineProps<{ modelValue: string; fieldKeys: string[]; readOnly?: boolean; errorLine?: number | null }>(),
        { readOnly: false, errorLine: null },
    )
    const emit = defineEmits<{
        'update:modelValue': [value: string]
        save: []
        cursor: [position: { line: number; column: number }]
    }>()

    const theme = useTheme()
    const container = ref<HTMLElement>()
    let editor: monaco.editor.IStandaloneCodeEditor | undefined
    let completionProvider: monaco.IDisposable | undefined
    let errorDecorations: monaco.editor.IEditorDecorationsCollection | undefined

    function hex(name: string) {
        const value = theme.current.value.colors[name]
        return (typeof value === 'string' ? value : '#000000').replace('#', '')
    }

    function applyTheme() {
        const name = theme.current.value.dark ? 'mail-admin-dark' : 'mail-admin-light'
        monaco.editor.defineTheme(name, {
            base: theme.current.value.dark ? 'vs-dark' : 'vs',
            inherit: true,
            rules: [
                { token: 'tag', foreground: hex('info') },
                { token: 'metatag', foreground: hex('info') },
                { token: 'attribute.name', foreground: hex('warning') },
                { token: 'attribute.value', foreground: hex('success') },
                { token: 'string', foreground: hex('success') },
                { token: 'delimiter.handlebars', foreground: hex('on-primary-container') },
                { token: 'variable.parameter.handlebars', foreground: hex('on-primary-container') },
                { token: 'keyword.helper.handlebars', foreground: hex('on-primary-container'), fontStyle: 'bold' },
            ],
            colors: {
                'editor.background': `#${hex('surface')}`,
                'editor.foreground': `#${hex('ink')}`,
                'editorLineNumber.foreground': `#${hex('ink-muted')}`,
                'editorLineNumber.activeForeground': `#${hex('ink')}`,
                'editor.lineHighlightBackground': `#${hex('surface-hover')}`,
                'editorCursor.foreground': `#${hex('ink')}`,
                'editor.selectionBackground': `#${hex('primary-container')}`,
                'editorWidget.background': `#${hex('surface-overlay')}`,
                'editorWidget.foreground': `#${hex('ink')}`,
                'editorWidget.border': `#${hex('border')}`,
                'editorSuggestWidget.background': `#${hex('surface-overlay')}`,
                'editorSuggestWidget.border': `#${hex('border')}`,
                'editorSuggestWidget.foreground': `#${hex('ink')}`,
                'editorSuggestWidget.highlightForeground': `#${hex('ink')}`,
                'editorSuggestWidget.selectedBackground': `#${hex('primary-container')}`,
                'editorSuggestWidget.selectedForeground': `#${hex('on-primary-container')}`,
                'editorSuggestWidget.selectedIconForeground': `#${hex('on-primary-container')}`,
                'editorSuggestWidget.focusHighlightForeground': `#${hex('on-primary-container')}`,
                'list.activeSelectionBackground': `#${hex('primary-container')}`,
                'list.activeSelectionForeground': `#${hex('on-primary-container')}`,
                'list.activeSelectionIconForeground': `#${hex('on-primary-container')}`,
                'list.focusForeground': `#${hex('on-primary-container')}`,
                'list.hoverBackground': `#${hex('surface-hover')}`,
                'list.hoverForeground': `#${hex('ink')}`,
                'list.highlightForeground': `#${hex('ink')}`,
                'list.focusHighlightForeground': `#${hex('on-primary-container')}`,
            },
        })
        monaco.editor.setTheme(name)
    }

    function applyErrorLine(line: number | null) {
        if (!editor) {
            return
        }
        errorDecorations?.clear()
        if (line !== null) {
            errorDecorations = editor.createDecorationsCollection([
                {
                    range: new monaco.Range(line, 1, line, 1),
                    options: { isWholeLine: true, className: 'monaco-error-line' },
                },
            ])
        }
    }

    onMounted(() => {
        applyTheme()
        editor = monaco.editor.create(container.value!, {
            value: props.modelValue,
            language: 'handlebars',
            minimap: { enabled: false },
            wordWrap: 'on',
            automaticLayout: true,
            readOnly: props.readOnly,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 13,
            lineHeight: 20,
            fontLigatures: false,
            scrollBeyondLastLine: false,
            padding: { top: 8 },
        })

        editor.onDidChangeModelContent((event) => {
            if (!event.isUndoing && !event.isRedoing) {
                closeTypedTag(event.changes)
            }
            emit('update:modelValue', editor!.getValue())
        })
        editor.onDidChangeCursorPosition(({ position }) => {
            emit('cursor', { line: position.lineNumber, column: position.column })
        })
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => emit('save'))
        editor.addCommand(
            monaco.KeyCode.Tab,
            expandOrIndent,
            'editorTextFocus && !suggestWidgetVisible && !inSnippetMode && !editorHasSelection',
        )

        completionProvider = monaco.languages.registerCompletionItemProvider('handlebars', {
            triggerCharacters: ['{'],
            provideCompletionItems(model, position) {
                const word = model.getWordUntilPosition(position)
                const range = new monaco.Range(
                    position.lineNumber,
                    word.startColumn,
                    position.lineNumber,
                    word.endColumn,
                )
                return {
                    suggestions: props.fieldKeys.map((key) => ({
                        label: `{{${key}}}`,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: key,
                        range,
                    })),
                }
            },
        })
        applyErrorLine(props.errorLine)
    })

    watch(
        () => props.modelValue,
        (value) => {
            if (editor && editor.getValue() !== value) {
                editor.setValue(value)
            }
        },
    )

    watch(() => theme.current.value.dark, applyTheme)
    watch(() => props.errorLine, applyErrorLine)
    watch(
        () => props.readOnly,
        (readOnly) => editor?.updateOptions({ readOnly }),
    )

    function expandOrIndent() {
        const position = editor?.getPosition()
        const model = editor?.getModel()
        if (!editor || !position || !model || props.readOnly) {
            return
        }
        const line = model.getLineContent(position.lineNumber)
        const result = expandEmmet(line.slice(0, position.column - 1))
        if (!result) {
            editor.trigger('keyboard', 'tab', null)
            return
        }
        const indentation = /^\s*/.exec(line)?.[0] ?? ''
        const text = result.expansion.replace(/\n/g, `\n${indentation}`)
        const start = position.column - result.abbreviation.length
        const caret = text.indexOf('></')
        const offset = caret === -1 ? text.length : caret + 1
        const before = text.slice(0, offset).split('\n')
        const caretLine = position.lineNumber + before.length - 1
        const caretColumn = before.length === 1 ? start + offset : (before[before.length - 1]?.length ?? 0) + 1
        editor.executeEdits(
            'emmet',
            [{ range: new monaco.Range(position.lineNumber, start, position.lineNumber, position.column), text }],
            [new monaco.Selection(caretLine, caretColumn, caretLine, caretColumn)],
        )
    }

    function closeTypedTag(changes: monaco.editor.IModelContentChange[]) {
        const change = changes[0]
        const model = editor?.getModel()
        if (!editor || !model || changes.length !== 1 || change?.text !== '>') {
            return
        }
        const line = change.range.startLineNumber
        const column = change.range.startColumn + 1
        const closing = closingTagFor(model.getLineContent(line).slice(0, column - 1))
        if (!closing) {
            return
        }
        editor.executeEdits(
            'auto-close-tag',
            [{ range: new monaco.Range(line, column, line, column), text: closing }],
            [new monaco.Selection(line, column, line, column)],
        )
    }

    onBeforeUnmount(() => {
        completionProvider?.dispose()
        editor?.dispose()
    })

    function insertText(text: string) {
        if (!editor) {
            return
        }
        const selection = editor.getSelection()
        editor.executeEdits('insert-placeholder', [
            { range: selection ?? new monaco.Range(1, 1, 1, 1), text, forceMoveMarkers: true },
        ])
        editor.focus()
    }

    defineExpose({ insertText })
</script>

<style scoped>
    .monaco-container {
        height: 100%;
        min-height: 320px;
    }

    .monaco-container :deep(.monaco-error-line) {
        background: rgb(var(--v-theme-error-container));
    }
</style>
