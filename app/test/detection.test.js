import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Detecteur, detecter } from '../js/detection.js';
import { genererLancer } from '../js/generateur.js';

const NOMS = ['0-50', '0-100', '0-400 m', '100-0'];

// Points à 5 Hz à partir de paliers [durée en s, vitesse de fin en km/h] : la vitesse varie linéairement
// d'un palier à l'autre
function points(paliers, { debutMs = 0, fix = () => true } = {}) {
    const resultat = [];
    let ms = 0;
    let vitesse = paliers[0][1];
    for (const [duree, cible] of paliers) {
        const depart = vitesse;
        for (let i = 0; i < duree * 5; i++) {
            vitesse = depart + ((cible - depart) * (i + 1)) / (duree * 5);
            resultat.push({ fix: fix(ms), hdop: 1, msJour: debutMs + ms, vitesse });
            ms += 200;
        }
    }
    return resultat;
}

function detecterAvecAbandons(liste) {
    const detecteur = new Detecteur();
    const evenements = [];
    const abandons = [];
    for (const point of liste) {
        const resultat = detecteur.ajouter(point);
        evenements.push(...resultat.evenements);
        if (resultat.abandon) abandons.push(resultat.abandon);
    }
    return { evenements, abandons };
}

const parNom = (evenements) => Object.fromEntries(evenements.map((e) => [e.nom, e]));

// L'interpolation linéaire entre deux points suppose une vitesse qui varie régulièrement. À l'arrêt complet
// (fin de freinage), la vitesse cesse de baisser entre deux points : erreur de quelques centièmes.
const TOLERANCE = { '0-50': 0.02, '0-100': 0.02, '0-400 m': 0.02, '100-0': 0.05 };

test('lancer sans bruit : temps égaux à la référence', () => {
    const { points: liste, verite } = genererLancer({ bruit: 0 });
    const evenements = parNom(detecter(liste));
    for (const nom of NOMS) {
        assert.ok(Math.abs(evenements[nom].duree - verite[nom]) < TOLERANCE[nom], `${nom} : ${evenements[nom].duree} au lieu de ${verite[nom]}`);
        assert.equal(evenements[nom].douteux, false);
    }
    assert.ok(Math.abs(evenements['100-0'].distance - 48.2) < 0.5);
});

test('lancers bruités : temps à moins de 0,1 s de la référence', () => {
    for (let graine = 1; graine <= 20; graine++) {
        const { points: liste, verite } = genererLancer({ graine });
        const evenements = parNom(detecter(liste));
        for (const nom of NOMS) {
            assert.ok(evenements[nom], `${nom} non détecté (graine ${graine})`);
            assert.ok(Math.abs(evenements[nom].duree - verite[nom]) < 0.1, `${nom}, graine ${graine}`);
        }
    }
});

test('points perdus : évènements détectés, douteux seulement s\'il y a un trou de plus de 500 ms', () => {
    for (let graine = 1; graine <= 20; graine++) {
        const { points: liste } = genererLancer({ graine, pertes: 0.15 });
        for (const evenement of detecter(liste)) {
            const trou = liste.some((p, i) => i > 0 && p.msJour > evenement.debut && liste[i - 1].msJour < evenement.fin
                && p.msJour - liste[i - 1].msJour > 500);
            assert.equal(evenement.douteux, trou, `${evenement.nom}, graine ${graine}`);
        }
    }
});

test('passage de minuit pendant le lancer', () => {
    const debutMs = 86_400_000 - 8_000;
    const { points: liste, verite } = genererLancer({ bruit: 0, debutMs });
    const evenements = parNom(detecter(liste));
    for (const nom of NOMS) assert.ok(Math.abs(evenements[nom].duree - verite[nom]) < TOLERANCE[nom], nom);
});

test('abandon si la vitesse retombe de plus de 3 km/h sous le maximum', () => {
    // Arrêt, montée à 60 km/h, lever de pied à 55, remontée à 110
    const { evenements, abandons } = detecterAvecAbandons(points([[2, 0], [5, 60], [1, 55], [5, 110]]));
    assert.deepEqual(evenements.map((e) => e.nom), ['0-50']);
    assert.deepEqual(abandons, ['lancer']);
});

test('pas de lancer sans arrêt d\'au moins 1 s', () => {
    const { evenements } = detecterAvecAbandons(points([[0.6, 0], [10, 110]]));
    assert.equal(evenements.length, 0);
});

test('vitesse stable : le lancer et le freinage sont abandonnés', () => {
    // 0 → 80 puis palier à 80 pendant 10 s, puis 80 → 110 : pas de 0-100
    let resultat = detecterAvecAbandons(points([[2, 0], [5, 80], [10, 80], [3, 110]]));
    assert.deepEqual(resultat.evenements.map((e) => e.nom), ['0-50']);
    assert.deepEqual(resultat.abandons, ['lancer']);

    // 105 → 99 puis palier à 99 pendant 10 s, puis arrêt : pas de 100-0
    resultat = detecterAvecAbandons(points([[1, 105], [1, 99], [10, 99], [4, 0]]));
    assert.equal(resultat.evenements.length, 0);
    assert.deepEqual(resultat.abandons, ['freinage']);
});

test('freinage abandonné si la vitesse remonte de plus de 3 km/h', () => {
    const { evenements, abandons } = detecterAvecAbandons(points([[1, 110], [1, 70], [1, 80], [3, 0]]));
    assert.equal(evenements.length, 0);
    assert.deepEqual(abandons, ['freinage']);
});

test('perte du fix pendant un lancer : évènement douteux', () => {
    const liste = points([[2, 0], [10, 110]], { fix: (ms) => ms !== 4_000 });
    const evenements = parNom(detecter(liste));
    assert.equal(evenements['0-50'].douteux, true);
    assert.equal(evenements['0-100'].douteux, true);
});

test('sans fix à l\'arrêt, pas de passage à « prêt »', () => {
    const liste = points([[3, 0], [10, 110]], { fix: (ms) => ms < 1_800 || ms > 2_400 });
    // Arrêt avec fix de 2,6 s à 3 s seulement (0,4 s) : pas prêt au départ
    assert.equal(detecter(liste).length, 0);
});
