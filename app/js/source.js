// Source unique des points GPS pour l'interface : le boîtier BLE, ou des points rejoués en temps réel
// (lancer simulé ou session enregistrée). Pendant une simulation ou une relecture, les points du boîtier
// sont ignorés. Évènements émis : « point » (detail : point au format de trame.js) et « simulation »
// (detail : { facteur, libelle } au démarrage, null à la fin).

import { genererLancer } from './generateur.js';
import { tempsContinus } from './session.js';

const MS_JOUR = 86_400_000;
const PERIODE_HORLOGE_MS = 25;

export class SourcePoints extends EventTarget {
    simulation = null;  // { facteur, libelle } pendant une simulation ou une relecture
    #minuterie = null;

    constructor(ble) {
        super();
        ble.addEventListener('point', (e) => {
            if (!this.simulation) this.#emettre(e.detail);
        });
    }

    // Rejoue un lancer aléatoire
    simuler(facteur = 1) {
        const { points } = genererLancer({ graine: Math.floor(Math.random() * 2 ** 32), debutMs: Date.now() % MS_JOUR });
        this.rejouer(points, facteur, 'Simulation');
    }

    // Rejoue des points (lancer généré ou session enregistrée), chacun à son heure GPS, accélérée du
    // facteur donné. Les points gardent leur heure d'origine.
    rejouer(points, facteur = 1, libelle = 'Relecture') {
        this.arreterSimulation();
        if (!points.length) return;
        const continus = tempsContinus(points);
        const depart = performance.now();
        let i = 0;
        this.simulation = { facteur, libelle };
        this.dispatchEvent(new CustomEvent('simulation', { detail: this.simulation }));
        this.#minuterie = setInterval(() => {
            const ecoule = (performance.now() - depart) * facteur;
            while (i < points.length && continus[i] - continus[0] <= ecoule) this.#emettre(points[i++]);
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
