// Interface : navigation, écran Direct, simulation, Wake Lock, service worker

import { ConnexionBle, bleDisponible } from './ble.js';
import { SourcePoints } from './source.js';
import { initialiserPerformance } from './ecran-performance.js';
import { initialiserHistorique } from './ecran-historique.js';
import { initialiserReglages, modeDeveloppeur } from './ecran-reglages.js';
import { $ } from './dom.js';

const FENETRE_FREQUENCE_MS = 2000;
const LIBELLES_ETAT = {
    deconnecte: 'Déconnecté',
    connexion: 'Connexion…',
    connecte: 'Connecté',
    reconnexion: 'Reconnexion…',
};

const ble = new ConnexionBle();
const source = new SourcePoints(ble);

const ecrans = {
    performance: initialiserPerformance(source),
    // Relecture d'une session : on bascule sur l'écran Performance pour voir la détection
    historique: initialiserHistorique({ source, surRelecture: () => afficherEcran('performance') }),
    reglages: initialiserReglages({ surModeDeveloppeur: afficherBarreDev }),
};

// Navigation
function afficherEcran(nom) {
    for (const ecran of document.querySelectorAll('.ecran')) ecran.hidden = ecran.id !== `ecran-${nom}`;
    for (const bouton of document.querySelectorAll('.onglets button')) {
        if (bouton.dataset.ecran === nom) bouton.setAttribute('aria-current', 'page');
        else bouton.removeAttribute('aria-current');
    }
    ecrans[nom]?.afficher();
}

for (const bouton of document.querySelectorAll('.onglets button')) {
    bouton.addEventListener('click', () => afficherEcran(bouton.dataset.ecran));
}
$('bouton-performance').addEventListener('click', () => afficherEcran('performance'));

// Connexion
if (!bleDisponible()) {
    $('message-compatibilite').hidden = false;
    $('bouton-connexion').disabled = true;
}

$('bouton-connexion').addEventListener('click', async () => {
    if (ble.etat !== 'deconnecte') {
        ble.deconnecter();
        return;
    }
    try {
        await ble.connecter();
    } catch (erreur) {
        // NotFoundError : l'utilisateur a fermé la fenêtre de choix de l'appareil
        if (erreur.name !== 'NotFoundError') alert(`Connexion impossible : ${erreur.message}`);
    }
});

ble.addEventListener('etat', (e) => {
    const etat = e.detail;
    $('etat-connexion').dataset.etat = etat;
    $('etat-connexion').textContent = LIBELLES_ETAT[etat];
    $('bouton-connexion').textContent = etat === 'deconnecte' ? 'Connecter' : 'Déconnecter';
    if (etat === 'deconnecte' && !source.simulation) afficherPoint(null);
});

// Simulation et relecture (mode développeur) : points rejoués comme s'ils venaient du boîtier
function afficherBarreDev() {
    $('barre-dev').hidden = !modeDeveloppeur() || source.simulation !== null;
    $('bandeau-simulation').hidden = source.simulation === null;
}

$('bouton-simuler').addEventListener('click', () => source.simuler(Number($('facteur-simulation').value)));
$('arreter-simulation').addEventListener('click', () => source.arreterSimulation());

source.addEventListener('simulation', (e) => {
    if (e.detail) $('texte-simulation').textContent = `${e.detail.libelle} ×${e.detail.facteur}`;
    afficherBarreDev();
    if (e.detail === null && ble.etat === 'deconnecte') afficherPoint(null);
});
afficherBarreDev();

// Écran Direct
const receptions = [];

function frequence() {
    const limite = performance.now() - FENETRE_FREQUENCE_MS;
    while (receptions.length && receptions[0] < limite) receptions.shift();
    return receptions.length / (FENETRE_FREQUENCE_MS / 1000);
}

function afficherFrequence() {
    const actif = ble.etat !== 'deconnecte' || source.simulation;
    $('frequence').textContent = actif ? `${frequence().toFixed(1)} Hz` : '—';
}

function afficherPoint(point) {
    const fix = point?.fix ?? false;
    $('vitesse').textContent = fix ? Math.round(point.vitesse) : '—';
    $('fix').textContent = fix ? 'Fix' : 'Pas de fix';
    $('fix').className = fix ? 'avec-fix' : 'sans-fix';
    $('satellites').textContent = point ? point.satellites : '—';
    $('hdop').textContent = point?.hdop != null ? point.hdop.toFixed(1) : '—';
    $('altitude').textContent = fix ? `${point.altitude} m` : '—';
    afficherFrequence();
}

source.addEventListener('point', (e) => {
    receptions.push(performance.now());
    afficherPoint(e.detail);
});

// La fréquence doit retomber à 0 quand plus rien n'arrive
setInterval(afficherFrequence, 500);

// Wake Lock : sans écran allumé, Chrome coupe la connexion Bluetooth
async function garderEcranAllume() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
        await navigator.wakeLock.request('screen');
    } catch (erreur) {
        console.warn('Wake Lock refusé :', erreur.message);
    }
}

document.addEventListener('visibilitychange', garderEcranAllume);
garderEcranAllume();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
