# burnout

Chronomètre de performances automobiles fait maison : 0-50, 0-100, 0-400 m, 100-0.

Un boîtier ESP32 + GPS envoie position et vitesse en Bluetooth Low Energy à une web app (PWA) sur
smartphone Android, qui affiche les données en direct, enregistre les sessions et détecte automatiquement
les évènements.

Projet pour le fun : simplicité avant tout.

## Matériel

- ESP32 devkit
- Récepteur GPS u-blox NEO-6M + antenne externe
- Alimentation par l'USB du devkit (allume-cigare ou batterie externe)

| NEO-6M | ESP32 devkit |
|--------|--------------|
| TX     | GPIO16 (RX2) |
| RX     | GPIO17 (TX2) |
| VCC    | 3V3 ou 5V selon la carte GPS |
| GND    | GND          |

## Organisation

- `firmware/` : firmware ESP32 (PlatformIO, framework Arduino)
- `app/` : web app (vanilla JS, publiée sur GitHub Pages)

## Utilisation

L'application est publiée sur <https://leahpar.github.io/burnout/>. Elle nécessite Chrome sur Android
(Web Bluetooth).

1. Brancher le boîtier : la LED clignote lentement sans fix GPS, reste allumée avec un fix.
2. Ouvrir l'URL dans Chrome, puis menu ⋮ → « Ajouter à l'écran d'accueil » (ou « Installer
   l'application ») : l'appli s'ouvre alors en plein écran et fonctionne sans réseau.
3. Appuyer sur « Connecter » et choisir `burnout`. Il faut le refaire à chaque ouverture de l'appli ;
   après une coupure, la reconnexion est automatique.

L'écran reste allumé tant que l'appli est au premier plan.

## Développement

Tests de l'appli (Node intégré, sans dépendance) :

```sh
node --test app/test/*.test.js
```

Pour essayer l'appli en local : `python3 -m http.server -d app 8000`, puis <http://localhost:8000>
(Web Bluetooth et le service worker exigent HTTPS ou `localhost`).

Le dossier `app/` est publié sur GitHub Pages par GitHub Actions (`.github/workflows/pages.yml`) à
chaque push sur `main`. Incrémenter `VERSION` dans `app/sw.js` à chaque livraison, sinon les
téléphones gardent l'ancienne version en cache.
