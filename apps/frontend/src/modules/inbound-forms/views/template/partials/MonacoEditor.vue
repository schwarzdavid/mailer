<template>
    <div ref="container" class="monaco-container" />
</template>

<script setup lang="ts">
    import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
    import * as monaco from 'monaco-editor'
    import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
    import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

    ;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
        getWorker(_workerId: string, label: string) {
            if (label === 'html' || label === 'handlebars') {
                return new HtmlWorker()
            }
            return new EditorWorker()
        },
    }

    const props = defineProps<{ modelValue: string; fieldKeys: string[] }>()
    const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

    const container = ref<HTMLElement>()
    let editor: monaco.editor.IStandaloneCodeEditor | undefined
    let completionProvider: monaco.IDisposable | undefined

    onMounted(() => {
        editor = monaco.editor.create(container.value!, {
            value: props.modelValue,
            language: 'handlebars',
            minimap: { enabled: false },
            wordWrap: 'on',
            automaticLayout: true,
        })

        editor.onDidChangeModelContent(() => {
            emit('update:modelValue', editor!.getValue())
        })

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
    })

    watch(
        () => props.modelValue,
        (value) => {
            if (editor && editor.getValue() !== value) {
                editor.setValue(value)
            }
        },
    )

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
            {
                range: selection ?? new monaco.Range(1, 1, 1, 1),
                text,
                forceMoveMarkers: true,
            },
        ])
        editor.focus()
    }

    defineExpose({ insertText })
</script>

<style scoped>
    .monaco-container {
        height: 100%;
        min-height: 480px;
    }
</style>
