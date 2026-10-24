# Ivoire Sim — base du jeu (PHP + MySQL)

Jeu de simulation de vie en Côte d'Ivoire : comptes, villes, propriétés, véhicules, emplois, banque, multijoueur de base.

## Installation (XAMPP / WAMP / Laragon)

1. Copie le dossier `ivoire-sim` dans `htdocs` (XAMPP) ou `www` (WAMP).
2. Lance Apache et MySQL.
3. Ouvre phpMyAdmin → onglet **Importer** → choisis `database/schema_install.sql` → Exécuter.
4. Vérifie `config/config.php` (utilisateur MySQL, mot de passe).
5. Ouvre `http://localhost/ivoire-sim/public/`.
6. Pour la boutique de meubles et l’aménagement des maisons, importe aussi `database/migrations/20261024_home_furniture.sql`.

En ligne : pointe la racine du site vers le dossier `public/` (les dossiers `config/` et `src/` ne doivent pas être accessibles depuis le web).

## Structure

```
database/schema_install.sql tables + données de départ (6 villes, propriétés, véhicules, emplois)
config/config.php     identifiants MySQL et réglages du jeu
src/bootstrap.php     connexion PDO, session, CSRF, helpers
public/api.php        toutes les actions du jeu (JSON)
public/index.html     interface (connexion → ville → jeu)
public/assets/        style.css, app.js
```

## Ce qui est déjà en place

- Inscription / connexion (mots de passe hashés, session, protection CSRF)
- Choix des villes (Abidjan, Yopougon, Cocody, Marcory, Plateau, Adjamé) avec aperçu urbain interactif Three.js
- Exploration 3D d'Abidjan avec conduite, mini-carte et points d'intérêt depuis le bouton « Explorer en 3D »
- Bonus unique de 1 000 000 FCFA à la première arrivée en ville, y compris pour les comptes existants
- Emplois : postuler, travailler (cooldown, énergie, XP, niveaux)
- Propriétés et véhicules : achat avec transaction SQL (une propriété = un seul propriétaire)
- Banque : dépôt, retrait, virement entre joueurs, historique
- Besoins vitaux : manger, boire, dormir
- Liste des joueurs connectés dans la même ville

## Prochaines étapes suggérées

1. Carte interactive des quartiers + déplacements (Leaflet.js ou canvas)
2. Téléphone : messagerie entre joueurs (table `messages` déjà prête)
3. Décroissance automatique de la faim/soif (tâche cron ou calcul à la connexion)
4. Chat en temps réel (WebSocket avec Ratchet, ou polling AJAX pour commencer)
5. Étendre la carte 3D existante aux autres villes et ajouter le déplacement à pied

### Mise à jour du bonus d'arrivée

Sur une installation existante, exécute `database/migrations/20261024_arrival_bonus.sql` une seule fois dans phpMyAdmin. Le bonus est crédité lors de la première requête authentifiée du joueur après la mise à jour ; la table `player_arrival_bonuses` empêche tout double versement. L'aperçu 3D charge Three.js depuis cdnjs et nécessite donc un accès Internet pour s'afficher.

### Carte 3D

La carte est disponible dans `public/city3d.html`. Le quartier des tours utilise les modèles et textures Downtown City MegaKit, servis localement dans `public/assets/downtown-city/` ; les textures sont optimisées pour limiter la mémoire graphique. La circulation et la voiture conduite utilisent des véhicules Quaternius ; lorsqu'un joueur possède un véhicule au garage, son premier véhicule non-moto détermine le modèle conduit. Des personnages peuplent la ville et des animaux sont visibles dans l'enclos à l'est. Ces modèles et leurs licences CC0 sont servis localement dans `public/assets/quaternius/`. Three.js, `OrbitControls` et les chargeurs glTF, OBJ et MTL sont servis dans `public/vendor/`, sans dépendance au CDN. Si WebGL est indisponible, une carte 2D interactive de secours représentant également les véhicules, les personnages et les animaux s'affiche. Le modèle Downtown City MegaKit est sous licence CC0 ; sa licence est conservée dans `public/assets/downtown-city/License_Standard.txt`. Le fichier `public/vendor/LICENSE-three.txt` conserve la licence MIT de Three.js.

Les modèles du dossier `D:\amelioration` ont été ajoutés sans remplacer les ressources existantes. Quatre maisons, un café, une librairie, un bus de ville et un cabriolet apparaissent dans la ville 3D. Le bus est conduisible en s'en approchant puis en appuyant sur E/C. Les 17 nouveaux modèles de bâtiments, véhicules et intérieurs sont conservés dans `public/models/amelioration/`. Deux variantes Cozy (cuisinier et astronaute) rejoignent le personnage animé existant ; elles sont dans `public/models/characters/` et sélectionnables dans le créateur. Le Cozy original, identique au modèle déjà installé, n'est pas dupliqué. Le bouton **Modèles 3D** du téléphone ouvre la galerie des 20 modèles pour prévisualiser les autres maisons, intérieurs de véhicules, tableau de bord et intérieurs de commerces. L'aperçu interactif nécessite WebGL ; les modèles restent servis localement.

### Personnage et déplacements

Sur une base déjà installée, exécuter `database/migrations/20261024_character_creator.sql` si le créateur n'est pas encore installé, puis `database/migrations/20261024_cozy_character_default.sql` pour définir le cuisinier animé comme apparence par défaut des nouveaux joueurs. À l'installation, le champ est créé directement par `database/schema_install.sql`. Dans la ville, cliquer sur l'avatar pour choisir parmi les quatre apparences Quaternius et les personnages Cozy animés. Le cuisinier est l'avatar par défaut ; ZQSD ou les flèches déclenchent la marche et Maj déclenche la course avec de vraies animations. Les autres apparences Quaternius conservent leur animation de déplacement simple. Le modèle animé et sa licence CC0 sont dans `public/models/characters/`. Approcher une voiture à moins de 8 m et appuyer sur E (ou C) pour entrer ; utiliser les mêmes touches pour conduire, puis E/C pour sortir. Sur écran tactile, utiliser la croix directionnelle, « Courir » et « Entrer/Sortir ». La carte 2D de secours indique la marche et la course par l'icône du personnage.

### Maisons et meubles

Importer `database/migrations/20261024_home_furniture.sql` après le schéma initial : la migration crée le catalogue et les inventaires, ajoute 123 modèles de meubles et enregistre les meubles placés dans chaque propriété. Elle peut être réexécutée sans effacer les meubles déjà présents.

Les joueurs achètent les meubles dans l’onglet **🛋️ Meubles** ou à la boutique près de l’université sur la carte 3D. Dans **Propriétés**, cliquer sur **Aménager** pour ouvrir `public/house.html` : la taille de la pièce suit le nombre de pièces de la propriété ; on peut poser, déplacer, tourner et reprendre les meubles. L’éditeur propose une vue 2D de secours si WebGL est indisponible. Les modèles Quaternius sont servis localement dans `public/models/furniture/` ; leur licence CC0 est conservée dans ce dossier.
