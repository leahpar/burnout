// Écran Direct : vitesse en grand, choix du véhicule, session de performance enregistrée au fil de l'eau
// avec détection des évènements en direct

import { Detecteur } from './detection.js';
import { creerSession } from './session.js';
import * as stockage from './stockage.js';
import { $, element, remplirVehicules } from './dom.js';
import { formaterResultat, formaterComplement } from './format.js';

const INTERVALLE_ENREGISTREMENT_MS = 5000;

// surSession(actif) est appelée au démarrage et à l'arrêt d'une session
export function initialiserDirect(source, { surSession }) {
    let session = null;
    let detecteur = null;
    let minuterieEnregistrement = null;
    let gpsDisponible = false;
    let modifiee = false;
    let enregistrements = Promise.resolve();  // les enregistrements s'enchaînent sans se chevaucher

    // Hors session : liste des véhicules, ou création du premier
    async function preparer() {
        const vehicules = await stockage.listerVehicules();
        const dernier = await stockage.lireDernierVehicule();
        remplirVehicules($('vehicule'), vehicules, dernier);
        $('nouveau-vehicule').hidden = vehicules.length > 0;
        $('commandes-session').hidden = !vehicules.length;
        afficherCommandes();
    }

    function afficherCommandes() {
        $('vehicule').disabled = session !== null;
        $('bouton-session').textContent = session ? 'Arrêter'
            : gpsDisponible ? 'Démarrer' : 'Démarrer (pas de GPS)';
        $('bouton-session').classList.toggle('bouton-danger', session !== null);
        $('session-en-cours').hidden = session === null;
        $('ecran-direct').classList.toggle('en-session', session !== null);
    }

    $('nouveau-vehicule').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nom = $('nom-vehicule').value.trim();
        if (!nom) return;
        const vehicule = await stockage.creerVehicule(nom);
        await stockage.memoriserDernierVehicule(vehicule.id);
        $('nom-vehicule').value = '';
        await preparer();
    });

    function enregistrer() {
        if (!session || !modifiee) return enregistrements;
        modifiee = false;
        const aEnregistrer = session;
        enregistrements = enregistrements
            .then(() => stockage.enregistrerSession(aEnregistrer))
            .catch((erreur) => console.error('Enregistrement de la session impossible :', erreur));
        return enregistrements;
    }

    function demarrer() {
        const vehiculeId = $('vehicule').value;
        if (!vehiculeId) return;
        stockage.memoriserDernierVehicule(vehiculeId);
        session = creerSession(vehiculeId);
        detecteur = new Detecteur();
        modifiee = true;
        enregistrer();
        minuterieEnregistrement = setInterval(enregistrer, INTERVALLE_ENREGISTREMENT_MS);
        $('bilan').hidden = true;
        afficherEvenements();
        afficherCommandes();
        surSession(true);
    }

    async function arreter() {
        if (!confirm('Arrêter la session ?')) return;
        detecteur = null;  // plus aucun point n'est ajouté
        clearInterval(minuterieEnregistrement);
        modifiee = true;
        await enregistrer();
        const n = session.evenements.length;
        session = null;
        $('bilan').textContent = `Session enregistrée : ${n} évènement${n > 1 ? 's' : ''}.`;
        $('bilan').hidden = false;
        afficherCommandes();
        surSession(false);
    }

    $('bouton-session').addEventListener('click', () => (session ? arreter() : demarrer()));

    // Enregistrement immédiat si l'appli passe en arrière-plan (elle peut y être tuée)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') enregistrer();
    });

    // Vitesse toujours affichée ; pendant une session, chaque point (avec ou sans fix) est stocké et passé
    // au détecteur
    source.addEventListener('point', (e) => {
        const point = e.detail;
        $('vitesse').textContent = point.fix ? Math.round(point.vitesse) : '—';
        if (!detecteur) return;
        session.points.push(point);
        modifiee = true;
        const { evenements } = detecteur.ajouter(point);
        if (evenements.length) {
            session.evenements.push(...evenements);
            afficherEvenements();
        }
    });

    // Du plus récent au plus ancien ; le premier est mis en avant par la feuille de style
    function afficherEvenements() {
        $('evenements').replaceChildren(...session.evenements.toReversed().map((evenement) => element('li',
            { className: evenement.douteux ? 'douteux' : '' },
            element('span', { className: 'resultat-ligne', textContent: formaterResultat(evenement) }),
            element('span', { className: 'complement', textContent: formaterComplement(evenement) }),
            ...(evenement.douteux ? [element('span', { className: 'mention-douteux', textContent: 'douteux' })] : []),
        )));
    }

    return {
        // À l'affichage de l'écran : rien à rafraîchir pendant une session
        afficher() {
            if (!session) preparer();
        },
        // Point sans fix ou plus de point reçu : vitesse inconnue
        effacerVitesse() {
            $('vitesse').textContent = '—';
        },
        signalerGps(disponible) {
            if (disponible === gpsDisponible) return;
            gpsDisponible = disponible;
            afficherCommandes();
        },
        sessionEnCours: () => session?.id ?? null,
    };
}
