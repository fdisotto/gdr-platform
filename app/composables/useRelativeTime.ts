/**
 * Helper minimale per "X min fa" relativo a un timestamp passato.
 * Italiano, niente Intl.RelativeTimeFormat per non variare a runtime sul
 * locale del browser.
 */
export function relativeTime(ts: number, now = Date.now()): string {
  const dt = Math.max(0, now - ts)
  const sec = Math.floor(dt / 1000)
  if (sec < 30) return 'ora'
  if (sec < 60) return `${sec} sec fa`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min fa`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h fa`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} g fa`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} mesi fa`
  const y = Math.floor(mo / 12)
  return `${y} anni fa`
}
