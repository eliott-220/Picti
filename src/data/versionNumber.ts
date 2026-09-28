// Numéro de version affiché : x.xxx.x (ex. 0.008.1).
// - premier chiffre : grande version (1 = sortie officielle) ;
// - trois chiffres du milieu : nouvelle fonctionnalité ;
// - dernier chiffre : correction ou petit ajustement.

/** « 0.8.1 » (package.json) → « 0.008.1 ». */
export function formatVersionNumber(semver: string): string {
  const [major = '0', feature = '0', fix = '0'] = semver.split('-')[0].split('.')
  return `${Number(major) || 0}.${String(Number(feature) || 0).padStart(3, '0')}.${Number(fix) || 0}`
}
