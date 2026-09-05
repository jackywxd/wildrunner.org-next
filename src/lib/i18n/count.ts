/**
 * A number in a sentence, in a language that may or may not have plurals.
 *
 * WHY A HELPER RATHER THAN `.replace("{count}", …)` AT FIFTEEN CALL SITES.
 * Chinese has no plural: 「{count} 篇文章」 is right for one article and for
 * twelve. English does, and there is no wording that hides it — "1 articles"
 * is wrong and "1 article(s)" is a form nobody writes on purpose. So the
 * dictionary has to be able to carry both forms, and something has to choose.
 *
 * THE CONVENTION IS ONE PIPE: `singular|plural`. A value with no pipe is used
 * as-is, which is every Chinese key and most English ones — so the Chinese
 * dictionaries did not change to make this work, and the 繁簡 converter never
 * has to know the convention exists. Measured before choosing it: no value in
 * either Chinese dictionary contains `|`.
 *
 * Zero takes the plural, which is what English does: "0 articles".
 */
export function countLabel(template: string, count: number): string {
  const forms = template.split("|");
  const chosen = forms.length > 1 && count !== 1 ? forms[1] : forms[0];
  return chosen.replace("{count}", String(count));
}
