/**
 * Copia um texto que ainda precisa ser buscado. A área de transferência só
 * aceita escrita logo depois do clique; entregar a promessa dentro do
 * `ClipboardItem` mantém a permissão mesmo com a requisição no meio (Safari
 * recusa um `writeText` depois de um `await`).
 */
export async function copyText(produce: () => Promise<string>): Promise<void> {
  const text = produce()
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })) }),
    ])
    return
  }
  await navigator.clipboard.writeText(await text)
}
