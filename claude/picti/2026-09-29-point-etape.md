# 2026-09-29 — Point d'étape : sur quoi se concentrer

Projet : [PICTI](../../CLAUDE.md) · Dépôt `eliott-220/picti` · Branche `claude/nice-cori-zbpf7v`
(suite de [Photo qui suit encore après 5 m](2026-09-28-photo-suit-encore.md))

## Question d'Eliott

« Sur quoi allons-nous nous concentrer pour avancer aujourd'hui ? »

## État constaté

- Production (picti.vercel.app) : **0.009.1**, confirmée READY (`dpl_CH3VQP2FGb3572UpwuMzskCNv7yp`).
- **0.009.2** (correctif « la photo suit encore après 5 m ») : construite en aperçu
  (`dpl_FoCA8J6QvSsEFqhZEsTroqxv2LE3`), **pas en production** → le correctif n'a jamais été
  testé sur iPhone.
- `main` ne contient que le `.gitignore` ; le code est réparti sur 5 branches `claude/*`.
  Cette branche repart de la plus à jour (`claude/wonderful-dirac-opn4nb`).

## Priorités proposées

1. **Mettre 0.009.2 en production et la tester sur le terrain** (dehors, iPhone) : c'est le
   cœur de PICTI (la photo doit rester à sa place). Tant que ce n'est pas validé, le reste
   repose sur du sable.
2. **Remettre de l'ordre dans le dépôt** : fusionner le travail dans `main` (PR), pour que
   chaque session parte de la bonne base.
3. Fonctions « compte » manquantes : **mot de passe oublié** (bloquant pour de vrais testeurs).
4. **Paiement Premium** (Stripe) : ouvre le modèle économique.
5. Plus tard : notifications de proximité, calibration de la focale, piste native (ARKit)
   si le GPS reste insuffisant.

## Décision

En attente du choix d'Eliott.
