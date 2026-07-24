/**
 * Copy text to the clipboard, falling back to the legacy execCommand path when
 * the async Clipboard API is unavailable (plain-http origins, older Safari).
 */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // fall through to the legacy path below
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  // Keep it out of view so the page does not jump while it is focused.
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}
