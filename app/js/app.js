// Interface : navigation, ligne d'état du GPS, simulation, Wake Lock, service worker

import { ConnexionBle, bleDisponible } from './ble.js';
import { SourcePoints } from './source.js';
import { SEUILS } from './detection.js';
import { initialiserDirect } from './ecran-direct.js';
import { initialiserHistorique } from './ecran-historique.js';
import { initialiserReglages, modeDeveloppeur } from './ecran-reglages.js';
import { VERSION } from './version.js';
import { $ } from './dom.js';

const FENETRE_FREQUENCE_MS = 2000;
const FREQUENCE_CORRECTE_HZ = 4.5;
const LIBELLES_ETAT = {
    deconnecte: 'Déconnecté',
    connexion: 'Connexion…',
    reconnexion: 'Reconnexion…',
};

const ble = new ConnexionBle();
const source = new SourcePoints(ble);

const direct = initialiserDirect(source, {
    surSession: (actif) => { document.querySelector('[data-ecran="direct"]').classList.toggle('en-session', actif); },
});
const ecrans = {
    direct,
    // Relecture d'une session : on bascule sur l'écran Direct pour voir la détection
    historique: initialiserHistorique({
        source, sessionEnCours: direct.sessionEnCours, surRelecture: () => afficherEcran('direct'),
    }),
    reglages: initialiserReglages({ surModeDeveloppeur: afficherBarreDev }),
};

// Navigation. Hors de l'écran Direct, une entrée d'historique du navigateur intercepte le bouton retour
// d'Android, qui sinon quitterait l'appli : il ferme le détail d'une session, puis revient à Direct.
let ecranCourant = 'direct';
let ignorerRetour = false;

function afficherEcran(nom) {
    ecranCourant = nom;
    for (const ecran of document.querySelectorAll('.ecran')) ecran.hidden = ecran.id !== `ecran-${nom}`;
    for (const bouton of document.querySelectorAll('.onglets button')) {
        if (bouton.dataset.ecran === nom) bouton.setAttribute('aria-current', 'page');
        else bouton.removeAttribute('aria-current');
    }
    ecrans[nom].afficher();
    if (nom !== 'direct' && !history.state?.burnout) history.pushState({ burnout: true }, '');
    if (nom === 'direct' && history.state?.burnout) {
        ignorerRetour = true;
        history.back();
    }
}

window.addEventListener('popstate', () => {
    if (ignorerRetour) {
        ignorerRetour = false;
        return;
    }
    if (ecranCourant === 'historique' && ecrans.historique.fermerDetail()) {
        history.pushState({ burnout: true }, '');
        return;
    }
    afficherEcran('direct');
});

for (const bouton of document.querySelectorAll('.onglets button')) {
    bouton.addEventListener('click', () => afficherEcran(bouton.dataset.ecran));
}
afficherEcran('direct');

// Connexion
if (!bleDisponible()) {
    $('message-compatibilite').hidden = false;
    $('bouton-connecter').disabled = true;
}

$('bouton-connecter').addEventListener('click', async () => {
    try {
        await ble.connecter();
    } catch (erreur) {
        // NotFoundError : l'utilisateur a fermé la fenêtre de choix de l'appareil
        if (erreur.name !== 'NotFoundError') alert(`Connexion impossible : ${erreur.message}`);
    }
});

$('bouton-deconnecter').addEventListener('click', () => ble.deconnecter());

$('etat-gps').addEventListener('click', () => {
    const ouvert = $('etat-detail').hidden;
    $('etat-detail').hidden = !ouvert;
    $('etat-gps').setAttribute('aria-expanded', String(ouvert));
});

ble.addEventListener('etat', (e) => {
    $('bouton-connecter').hidden = e.detail !== 'deconnecte';
    $('bouton-deconnecter').hidden = e.detail === 'deconnecte';
    if (e.detail === 'deconnecte' && !source.simulation) dernierPoint = null;
    afficherEtat();
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
    if (e.detail === null && ble.etat === 'deconnecte') dernierPoint = null;
    afficherEtat();
});
afficherBarreDev();

// Ligne d'état : qualité, satellites et fréquence ; HDOP et altitude dans le détail
const receptions = [];
let dernierPoint = null;

function frequence() {
    const limite = performance.now() - FENETRE_FREQUENCE_MS;
    while (receptions.length && receptions[0] < limite) receptions.shift();
    return receptions.length / (FENETRE_FREQUENCE_MS / 1000);
}

// Rouge : pas de données ou pas de fix ; vert : de quoi faire des mesures fiables ; orange entre les deux
function qualite(point, hz) {
    if (!point?.fix || hz === 0) return 'rouge';
    return point.hdop != null && point.hdop <= SEUILS.hdop && hz >= FREQUENCE_CORRECTE_HZ ? 'vert' : 'orange';
}

function afficherEtat() {
    const actif = ble.etat === 'connecte' || source.simulation !== null;
    const hz = actif ? frequence() : 0;
    const point = actif && hz > 0 ? dernierPoint : null;
    const niveau = qualite(point, hz);
    $('pastille').dataset.qualite = niveau;
    $('etat-texte').textContent = !actif ? LIBELLES_ETAT[ble.etat]
        : !point ? 'Aucune donnée'
        : `${point.fix ? '' : 'Pas de fix · '}${point.satellites} sat · ${hz.toFixed(1).replace('.', ',')} Hz`;
    $('hdop').textContent = point?.hdop != null ? point.hdop.toFixed(1).replace('.', ',') : '—';
    $('altitude').textContent = point?.fix ? `${point.altitude} m` : '—';
    if (!point?.fix) direct.effacerVitesse();
    direct.signalerGps(niveau !== 'rouge');
}

source.addEventListener('point', (e) => {
    receptions.push(performance.now());
    dernierPoint = e.detail;
    afficherEtat();
});

// La fréquence doit retomber à 0 quand plus rien n'arrive
setInterval(afficherEtat, 500);
afficherEtat();

// Version du build
const version = VERSION.date ? `Version ${VERSION.commit} du ${VERSION.date}` : `Version ${VERSION.commit}`;
$('version').textContent = version;
$('version-dev').textContent = VERSION.commit;

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
