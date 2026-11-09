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

L'application nécessite Chrome sur Android (Web Bluetooth).

*À compléter au fil de l'implémentation.*
