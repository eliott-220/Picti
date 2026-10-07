# 2026-10-07 — Pastille de précision sans « GPS » (0.016.2)

Parent : [CLAUDE.md](../../CLAUDE.md)

Demande d'Eliott : « enlever le nom "GPS" et juste laisser le symbole avec ±(3) m ».

- `src/components/SensorStatus.tsx` : la pastille du viseur passe de « 📍 GPS ±3 m » à
  « 📍 ±3 m » (espace insécable avant « m »). « · marche » conservé quand les pas sont comptés.
  En attendant le premier relevé : « 📍 … » au lieu de « GPS… » ; les messages d'erreur
  (refus, indisponible) restent en toutes lettres.
- Accessibilité : `title` et `aria-label` « Précision du GPS » sur la pastille, puisque le mot
  n'est plus affiché.
- Inchangés : couleurs (orange au-delà de ±12 m), bandeau « GPS imprécis (±18 m), patientez »
  de Reproduire, feuille « Position imprécise », toasts.
- Version 0.16.2 (affichée 0.016.2). 279 tests, lint et build OK.
