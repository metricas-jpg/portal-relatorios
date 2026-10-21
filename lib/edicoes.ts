/** Funções sem dependência do Google, usadas também no navegador. */

/** "01" → 1; "Edição 2" → 2 */
export function numeroEdicao(v: string): number | null {
  const m = (v || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
