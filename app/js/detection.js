// Détection des évènements (0-50, 0-100, 0-400 m, 100-0) à partir des points GPS, sans dépendance au DOM.
// Règles : voir la section « Détection des évènements » de notes/spec.md.

export const SEUILS = {
    arret: 2,          // km/h : sous ce seuil, la voiture est arrêtée ; départ et fin de freinage
    dureeArret: 1000,  // ms d'arrêt avant d'être « prêt »
    marge: 3,          // km/h : écart toléré sous le maximum (lancer) ou au-dessus du minimum (freinage)
    stagnation: 2000,  // ms sans progresser d'au moins 1 km/h : la mesure est abandonnée (vitesse stable)
    trou: 500,         // ms entre deux points au-delà desquelles l'évènement est douteux
    hdop: 5,           // HDOP au-delà duquel l'évènement est douteux
};

// Évènements mesurés depuis l'arrêt, tous pendant le même lancer
export const CIBLES_LANCER = [
    { nom: '0-50', vitesse: 50 },
    { nom: '0-100', vitesse: 100 },
    { nom: '0-400 m', distance: 400 },
];
const DEBUT_FREINAGE = 100;  // km/h

const MS_JOUR = 86_400_000;

// Instant où la vitesse passe par seuil entre deux points (interpolation linéaire)
const interpoler = (a, b, seuil) => a.t + ((seuil - a.vitesse) / (b.vitesse - a.vitesse)) * (b.t - a.t);
// Distance parcourue (m) entre deux instants (ms) à vitesse moyenne (km/h)
const distance = (va, vb, duree) => ((va + vb) / 2 / 3.6) * (duree / 1000);

// Suivi de la progression d'une mesure : sens = 1 en accélération, -1 en freinage. Renvoie faux si la
// vitesse n'a pas progressé d'au moins 1 km/h depuis SEUILS.stagnation (le bruit seul ne suffit pas).
function progresse(mesure, p, sens) {
    if (sens * (p.vitesse - mesure.vProgres) >= 1) {
        mesure.vProgres = p.vitesse;
        mesure.tProgres = p.t;
    }
    return p.t - mesure.tProgres <= SEUILS.stagnation;
}

/**
 * Détecteur à alimenter point par point. ajouter(point) renvoie { evenements, abandon } :
 * - evenements : évènements terminés par ce point, { nom, debut, fin, duree (s), douteux, ... }
 *   debut et fin sont en ms sur une échelle continue (msJour, plus 24 h à chaque passage de minuit)
 * - abandon : 'lancer' ou 'freinage' si ce point a interrompu une mesure, sinon null
 * etat : 'attente' | 'pret' | 'lancer' (le freinage est suivi en parallèle, dans freinage)
 */
export class Detecteur {
    etat = 'attente';
    lancer = null;
    freinage = null;
    #arretDepuis = null;
    #precedent = null;  // dernier point reçu, avec ou sans fix
    #precedentFix = null;  // dernier point avec fix
    #jours = 0;
    #anomalie = false;  // le point en cours rend douteuse toute mesure en cours

    ajouter(point) {
        const p = { ...point, t: this.#tempsContinu(point.msJour) };
        const trou = this.#precedent && p.t - this.#precedent.t > SEUILS.trou;
        this.#anomalie = !p.fix || p.hdop === null || p.hdop > SEUILS.hdop || trou;
        this.#precedent = p;
        const resultat = { evenements: [], abandon: null };

        if (this.lancer && this.#anomalie) this.lancer.douteux = true;
        if (this.freinage && this.#anomalie) this.freinage.douteux = true;

        // Sans fix, la vitesse n'a pas de sens : le point ne sert qu'à marquer la mesure en cours douteuse
        if (!p.fix) {
            if (this.etat === 'pret') this.etat = 'attente';
            this.#arretDepuis = null;
            return resultat;
        }

        const a = this.#precedentFix;
        this.#precedentFix = p;
        if (a) {
            this.#suivreLancer(a, p, resultat);
            this.#suivreFreinage(a, p, resultat);
        }
        this.#suivreArret(a, p);
        return resultat;
    }

    // L'heure GPS repart de 0 à minuit
    #tempsContinu(msJour) {
        const precedent = this.#precedent;
        if (precedent && msJour + this.#jours * MS_JOUR < precedent.t - MS_JOUR / 2) this.#jours++;
        return msJour + this.#jours * MS_JOUR;
    }

    #suivreArret(a, p) {
        if (p.vitesse >= SEUILS.arret) {
            this.#arretDepuis = null;
            if (this.etat === 'pret' && a) this.#demarrerLancer(a, p);
            return;
        }
        this.#arretDepuis ??= p.t;
        if (this.etat === 'attente' && p.t - this.#arretDepuis >= SEUILS.dureeArret) this.etat = 'pret';
    }

    #demarrerLancer(a, p) {
        const debut = interpoler(a, p, SEUILS.arret);
        this.etat = 'lancer';
        this.lancer = {
            debut,
            vMax: p.vitesse,
            vProgres: p.vitesse,
            tProgres: p.t,
            distance: distance(SEUILS.arret, p.vitesse, p.t - debut),
            restantes: [...CIBLES_LANCER],
            douteux: this.#anomalie,
        };
    }

    #suivreLancer(a, p, resultat) {
        const lancer = this.lancer;
        if (!lancer || p.t <= lancer.debut) return;

        if (p.vitesse < SEUILS.arret || p.vitesse < lancer.vMax - SEUILS.marge || !progresse(lancer, p, 1)) {
            this.#terminerLancer();
            resultat.abandon = 'lancer';
            return;
        }
        const distanceAvant = lancer.distance;
        lancer.distance += distance(a.vitesse, p.vitesse, p.t - a.t);
        lancer.vMax = Math.max(lancer.vMax, p.vitesse);

        for (const cible of [...lancer.restantes]) {
            let fin = null;
            const evenement = { nom: cible.nom };
            if (cible.vitesse && a.vitesse < cible.vitesse && p.vitesse >= cible.vitesse) {
                fin = interpoler(a, p, cible.vitesse);
            } else if (cible.distance && lancer.distance >= cible.distance) {
                const fraction = (cible.distance - distanceAvant) / (lancer.distance - distanceAvant);
                fin = a.t + fraction * (p.t - a.t);
                evenement.vitesse = a.vitesse + fraction * (p.vitesse - a.vitesse);  // vitesse de sortie
            }
            if (fin === null) continue;
            lancer.restantes.splice(lancer.restantes.indexOf(cible), 1);
            resultat.evenements.push({
                ...evenement, debut: lancer.debut, fin, duree: (fin - lancer.debut) / 1000, douteux: lancer.douteux,
            });
        }
        if (!lancer.restantes.length) this.#terminerLancer();
    }

    #terminerLancer() {
        this.lancer = null;
        this.etat = 'attente';
    }

    #suivreFreinage(a, p, resultat) {
        if (!this.freinage) {
            if (a.vitesse >= DEBUT_FREINAGE && p.vitesse < DEBUT_FREINAGE) {
                const debut = interpoler(a, p, DEBUT_FREINAGE);
                this.freinage = {
                    debut,
                    vMin: p.vitesse,
                    vProgres: p.vitesse,
                    tProgres: p.t,
                    distance: distance(DEBUT_FREINAGE, p.vitesse, p.t - debut),
                    douteux: this.#anomalie,
                };
            }
            return;
        }
        const freinage = this.freinage;
        if (p.vitesse > freinage.vMin + SEUILS.marge || !progresse(freinage, p, -1)) {
            this.freinage = null;
            resultat.abandon = 'freinage';
            return;
        }
        freinage.vMin = Math.min(freinage.vMin, p.vitesse);
        if (p.vitesse >= SEUILS.arret) {
            freinage.distance += distance(a.vitesse, p.vitesse, p.t - a.t);
            return;
        }
        const fin = interpoler(a, p, SEUILS.arret);
        freinage.distance += distance(a.vitesse, SEUILS.arret, fin - a.t);
        this.freinage = null;
        resultat.evenements.push({
            nom: '100-0', debut: freinage.debut, fin, duree: (fin - freinage.debut) / 1000,
            distance: freinage.distance, douteux: freinage.douteux,
        });
    }
}

// Détection sur une session complète (pour recalculer les évènements d'une session enregistrée)
export function detecter(points) {
    const detecteur = new Detecteur();
    return points.flatMap((point) => detecteur.ajouter(point).evenements);
}
