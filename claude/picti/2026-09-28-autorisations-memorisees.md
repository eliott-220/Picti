# 2026-09-28 — Autorisations caméra et boussole mémorisées (0.009.0)

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/beautiful-edison-87l36d`
(suite de [Heure des photos](2026-09-28-heure-des-photos.md))

## Demande

« Fais en sorte de garder en mémoire lorsque l'utilisateur a autorisé d'utiliser la caméra
et la boussole. »

## Constat

- **Boussole** : sur iPhone, l'accès (`DeviceOrientationEvent.requestPermission`) est
  redemandé à chaque ouverture de la page et exige un geste. L'app l'oubliait : il fallait
  retaper « Activer la boussole » à chaque fois.
- **Caméra** : chaque écran (accueil, chasse, recalage, selfie) ouvrait un nouveau flux et
  le coupait en partant ; iOS redemande souvent l'autorisation à chaque ouverture.
- Une page web ne peut pas supprimer la fenêtre d'autorisation du navigateur : seul le
  réglage Safari du site le peut (aA › Réglages du site web › Caméra › Autoriser).

## Réalisé

- `src/sensors/permissions.ts` : mémoire `localStorage` (`picti.autorisation.boussole`).
- `src/sensors/useOrientation.ts` : demande unique partagée (`requestCompass`), réponse
  mémorisée (effacée si refus) ; au lancement, si déjà accordée : réactivation sans geste si
  le système l'accepte, sinon au **premier appui n'importe où** ; tous les écrans sont
  prévenus de l'accord.
- `src/components/SensorStatus.tsx` : pastille « Boussole : touchez l'écran » dans ce cas.
- `src/sensors/useCamera.ts` : **un seul flux caméra partagé**, réutilisé d'un écran à
  l'autre, gardé 15 s après avoir quitté la caméra, coupé en arrière-plan, relancé au retour
  s'il a été interrompu ; en cas de refus, message indiquant le réglage Safari.
- Version **0.009.0**.

## Vérifications

- `npm test` (67 verts), `npm run lint`, `npm run build` : OK.
- Chromium, fausse caméra : accueil → chasse → accueil = **1 seule** demande d'accès ; jamais
  deux flux ouverts ; flux coupé 15 s après un écran sans caméra.
- Chromium, boussole façon iOS simulée : 1re ouverture → bouton, accord mémorisé ;
  réouverture → réactivée au premier appui n'importe où ; réouverture avec accord du
  système → active directement, sans bouton.
- Pas testé sur un vrai iPhone.

## Mise en ligne

- 28/09/2026 : **0.009.0** en production sur https://picti.vercel.app (déploiement
  `dpl_EPnnkgHnE3p8ENQJr7WHPTKcco4h`, commit `0c0cc37`).
