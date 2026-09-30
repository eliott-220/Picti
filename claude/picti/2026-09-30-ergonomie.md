# Améliorer l'ergonomie de l'app — 30 septembre 2026

Projet : [PICTI](../../CLAUDE.md) · Branche `claude/youthful-cannon-962c45`
Voir aussi : [Objectifs du jour (29/09)](2026-09-29-objectifs-du-jour.md)

## Question

« Comment puis-je t'aider à améliorer l'ergonomie de l'app ? »

## Ce dont Claude a besoin (ce que Claude ne peut pas voir seul)

Claude peut lancer l'app dans un navigateur (mode démo) et en faire des captures, mais
**sans caméra, boussole, GPS ni doigt** : tout ce qui se joue dehors, téléphone en main,
doit venir d'Eliott.

1. **Captures d'écran / vidéos d'écran iPhone** (enregistrement d'écran iOS) des moments
   où « ça coince », avec une phrase : ce que je voulais faire, ce qui s'est passé.
2. **Un carnet de frictions** pendant l'utilisation : une ligne par gêne
   (écran · geste · problème · gravité 1-3). Même les petites choses.
3. **Faire tester par 2-3 personnes qui ne connaissent pas PICTI**, sans rien leur
   expliquer, avec une mission (« retrouve cette photo », « géocadre un selfie »).
   Noter où elles hésitent, ce qu'elles cherchent, ce qu'elles demandent.
4. **Les maquettes V2** (Drive `Ecrans/V2`) comme référence : dire ce qui doit y
   ressembler et ce qui peut s'en écarter.
5. **Les priorités** : quels parcours comptent le plus (première ouverture, géocadrage
   en direct, chasse/capture, amis).

## Parcours à passer en revue

- Première ouverture : création de compte, autorisations caméra/boussole/localisation.
- Géocadrer en direct (photo, selfie) puis retrouver la photo.
- Chasse : trouver la photo, s'aligner, comprendre quand elle est capturée.
- Carte du monde, pile de photos d'un même endroit (glisser, points).
- Profil, amis par code, visibilité des photos, Premium.
- Usage à une main, en plein soleil, en marchant (taille des boutons, contraste).

## Proposition de méthode

Claude fait d'abord un **audit en mode démo** (captures de chaque écran à la taille
iPhone + liste de problèmes classés), Eliott complète avec le terrain, puis on corrige
par petites versions (`0.009.x` pour les ajustements, `0.010.0` si refonte d'un écran).

## Suite

- [ ] Eliott : envoyer captures / vidéos / carnet de frictions.
- [ ] Claude : audit en mode démo si demandé.
