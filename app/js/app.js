// Interface : navigation, écran Direct, Wake Lock, service worker

import { ConnexionBle, bleDisponible } from './ble.js';

const FENETRE_FREQUENCE_MS = 2000;
const LIBELLES_ETAT = {
    deconnecte: 'Déconnecté',
    connexion: 'Connexion…',
    connecte: 'Connecté',
    reconnexion: 'Reconnexion…',
};

const $ = (id) => document.getElementById(id);
const ble = new ConnexionBle();

// Navigation
function afficherEcran(nom) {
    for (const ecran of document.querySelectorAll('.ecran')) ecran.hidden = ecran.id !== `ecran-${nom}`;
    for (const bouton of document.querySelectorAll('.onglets button')) {
        if (bouton.dataset.ecran === nom) bouton.setAttribute('aria-current', 'page');
        else bouton.removeAttribute('aria-current');
    }
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
    if (etat === 'deconnecte') afficherPoint(null);
});

// Écran Direct
const receptions = [];

function frequence() {
    const limite = performance.now() - FENETRE_FREQUENCE_MS;
    while (receptions.length && receptions[0] < limite) receptions.shift();
    return receptions.length / (FENETRE_FREQUENCE_MS / 1000);
}

function afficherFrequence() {
    $('frequence').textContent = ble.etat === 'deconnecte' ? '—' : `${frequence().toFixed(1)} Hz`;
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

ble.addEventListener('point', (e) => {
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
