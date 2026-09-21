# PICTI — contexte projet

## Concept
PICTI est une appli de partage de photos géolocalisées en réalité augmentée, autour de l'idée du **« géocadrage »** : chaque photo est « gravée » (comme une plaque) à l'endroit exact où elle a été prise, avec sa position GPS et l'orientation (boussole) du téléphone au moment de la capture. On peut ensuite revenir sur place et utiliser un **viseur AR** pour retrouver et superposer la photo dans son cadre d'origine, in situ.

Tagline utilisée dans le MVP : *« Une fenêtre exacte sur l'endroit où tu étais. Grave une photo dans le lieu qui l'a vue naître. »*

## Origine
Projet repris à partir d'un dossier Google Drive partagé par Eliott :
https://drive.google.com/drive/u/1/folders/1Wg2jgN9fkHpWpn5_9rqAO0qRGjMsWQZ8

## État actuel
- Un MVP HTML autonome (single-page app, pas de dépendances externes hors polices Google Fonts) a été développé et publié en artifact Claude : https://claude.ai/artifact/RYhVHUuM1awGHaB1h4vkx4
- Voir `PICTI-MVP.md` pour le détail du fonctionnement du MVP.
- Stockage 100% local (localStorage du navigateur), aucun backend, aucun compte multi-utilisateur pour l'instant.
- Ces fichiers de doc (`PICTI.md`, `PICTI-MVP.md`, `CLAUDE.md`) sont gardés en local (dossier `Picti` sur le Mac d'Eliott), pas sur le Drive — préférence explicite d'Eliott.

## Pistes / à faire (non tranché)
- Backend + comptes utilisateurs pour un vrai partage multi-personnes.
- Persistance au-delà du localStorage (actuellement tout est perdu si le stockage du navigateur est vidé).
- Éventuel passage à une vraie app mobile (caméra + capteurs plus fiables qu'en PWA web).
