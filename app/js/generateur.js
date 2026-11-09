// Générateur de faux lancers : points au format de decoderTrame (trame.js), à 5 Hz.
// Scénario : arrêt, accélération avec passages de rapport jusqu'à vMax, palier, freinage, arrêt.

const PERIODE_MS = 200;
const PAS_SIMULATION_S = 0.001;

// Générateur pseudo-aléatoire à graine (mulberry32) : mêmes points à chaque appel
function aleatoire(graine) {
    let a = graine >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Loi normale centrée réduite (Box-Muller)
function gaussienne(hasard) {
    return Math.sqrt(-2 * Math.log(1 - hasard())) * Math.cos(2 * Math.PI * hasard());
}

// Vitesse réelle (km/h, sans bruit) échantillonnée toutes les millisecondes
function simulerProfil({ arret, acceleration, vMax, passages, dureePassage, palier, freinage }) {
    const vitesses = [];
    let v = 0;  // m/s
    let t = 0;
    let phase = 'arret';
    let finPassage = -1;
    let finPalier = 0;
    const restants = [...passages];

    while (phase !== 'fini') {
        vitesses.push(v * 3.6);
        if (phase === 'arret' && t >= arret) phase = 'acceleration';
        if (phase === 'acceleration') {
            if (restants.length && v * 3.6 >= restants[0]) {
                restants.shift();
                finPassage = t + dureePassage;
            }
            // Pendant un passage de rapport, la voiture perd un peu de vitesse
            const a = t < finPassage ? -0.5 : acceleration * (1 - (v * 3.6) / (vMax * 1.6));
            v += a * PAS_SIMULATION_S;
            if (v * 3.6 >= vMax) {
                phase = 'palier';
                finPalier = t + palier;
            }
        } else if (phase === 'palier' && t >= finPalier) {
            phase = 'freinage';
        } else if (phase === 'freinage') {
            v = Math.max(0, v - freinage * PAS_SIMULATION_S);
            if (v === 0) {
                phase = 'arret-final';
                finPalier = t + arret;
            }
        } else if (phase === 'arret-final' && t >= finPalier) {
            phase = 'fini';
        }
        t += PAS_SIMULATION_S;
    }
    return vitesses;
}

// Premier instant (s) où la vitesse franchit le seuil dans le sens donné, à partir de l'indice depuis
function franchissement(vitesses, seuil, montant, depuis = 0) {
    for (let i = Math.max(depuis, 1); i < vitesses.length; i++) {
        const [a, b] = [vitesses[i - 1], vitesses[i]];
        if (montant ? a < seuil && b >= seuil : a >= seuil && b < seuil) return i * PAS_SIMULATION_S;
    }
    return null;
}

// Temps de référence calculés sur le profil sans bruit, avec les mêmes conventions que la détection
// (départ et fin d'arrêt au seuil de 2 km/h)
function calculerVerite(vitesses, seuilArret) {
    const depart = franchissement(vitesses, seuilArret, true);
    const verite = {};
    for (const cible of [50, 100]) {
        const fin = franchissement(vitesses, cible, true);
        if (fin !== null) verite[`0-${cible}`] = fin - depart;
    }
    let distance = 0;
    for (let i = Math.round(depart / PAS_SIMULATION_S); i < vitesses.length; i++) {
        distance += (vitesses[i] / 3.6) * PAS_SIMULATION_S;
        if (distance >= 400) {
            verite['0-400 m'] = i * PAS_SIMULATION_S - depart;
            break;
        }
    }
    const debutFreinage = franchissement(vitesses, 100, false);
    if (debutFreinage !== null) {
        const finFreinage = franchissement(vitesses, seuilArret, false, Math.round(debutFreinage / PAS_SIMULATION_S));
        verite['100-0'] = finFreinage - debutFreinage;
    }
    return verite;
}

/**
 * Génère un faux lancer. Renvoie { points, verite } : verite donne, pour chaque évènement, la durée de
 * référence en secondes calculée sur le profil sans bruit.
 * - pertes : proportion de points perdus (trous dans les données)
 * - debutMs : heure GPS du premier point, en ms depuis minuit (pour tester le passage de minuit)
 */
export function genererLancer({
    arret = 3, acceleration = 5, vMax = 180, passages = [40, 75, 110], dureePassage = 0.4, palier = 2,
    freinage = 8, bruit = 0.3, pertes = 0, debutMs = 12 * 3_600_000, graine = 1, seuilArret = 2,
} = {}) {
    const vitesses = simulerProfil({ arret, acceleration, vMax, passages, dureePassage, palier, freinage });
    const hasard = aleatoire(graine);
    const points = [];
    for (let ms = 0; ms * 1e-3 / PAS_SIMULATION_S < vitesses.length; ms += PERIODE_MS) {
        if (hasard() < pertes) continue;
        const vraie = vitesses[Math.round(ms * 1e-3 / PAS_SIMULATION_S)];
        points.push({
            fix: true, heureValide: true, satellites: 8, hdop: 1.2,
            msJour: (debutMs + ms) % 86_400_000,
            vitesse: Math.max(0, Math.round((vraie + bruit * gaussienne(hasard)) * 100) / 100),
            altitude: 100, latitude: 0, longitude: 0,
        });
    }
    return { points, verite: calculerVerite(vitesses, seuilArret) };
}
