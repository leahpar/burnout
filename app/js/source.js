// Source unique des points GPS pour l'interface : le boîtier BLE, ou une simulation de lancer
// (générateur rejoué en temps réel). Pendant une simulation, les points du boîtier sont ignorés.
// Évènements émis : « point » (detail : point au format de trame.js) et « simulation » (detail : facteur
// d'accélération au démarrage, null à la fin).

import { genererLancer } from './generateur.js';

const MS_JOUR = 86_400_000;
const PERIODE_HORLOGE_MS = 25;

export class SourcePoints extends EventTarget {
    simulation = null;  // { facteur } pendant une simulation
    #minuterie = null;

    constructor(ble) {
        super();
        ble.addEventListener('point', (e) => {
            if (!this.simulation) this.#emettre(e.detail);
        });
    }

    // Rejoue un lancer aléatoire, chaque point à son heure GPS (accélérée du facteur donné)
    simuler(facteur = 1) {
        this.arreterSimulation();
        const debutMs = Date.now() % MS_JOUR;
        const { points } = genererLancer({ graine: Math.floor(Math.random() * 2 ** 32), debutMs });
        const depart = performance.now();
        let i = 0;
        this.simulation = { facteur };
        this.dispatchEvent(new CustomEvent('simulation', { detail: facteur }));
        this.#minuterie = setInterval(() => {
            const ecoule = (performance.now() - depart) * facteur;
            while (i < points.length && (points[i].msJour - debutMs + MS_JOUR) % MS_JOUR <= ecoule) {
                this.#emettre(points[i++]);
            }
            if (i >= points.length) this.arreterSimulation();
        }, PERIODE_HORLOGE_MS);
    }

    arreterSimulation() {
        if (!this.simulation) return;
        clearInterval(this.#minuterie);
        this.simulation = null;
        this.dispatchEvent(new CustomEvent('simulation', { detail: null }));
    }

    #emettre(point) {
        this.dispatchEvent(new CustomEvent('point', { detail: point }));
    }
}
