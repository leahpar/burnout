// Écran Performance : choix du véhicule, session enregistrée au fil de l'eau, détection en direct

import { Detecteur } from './detection.js';
import { creerSession } from './session.js';
import * as stockage from './stockage.js';
import { $, element, remplirVehicules } from './dom.js';
import { formaterResultat, formaterComplement } from './format.js';

const INTERVALLE_ENREGISTREMENT_MS = 5000;
const DUREE_ABANDON_MS = 3000;
const LIBELLES_ETAT = { attente: 'Attente', pret: 'Prêt', 'en-cours': 'En cours', abandon: 'Abandonné' };

export function initialiserPerformance(source) {
    let session = null;
    let detecteur = null;
    let minuterieEnregistrement = null;
    let minuterieAbandon = null;
    let abandonJusqua = 0;
    let modifiee = false;
    let enregistrements = Promise.resolve();  // les enregistrements s'enchaînent sans se chevaucher

    function afficherVue(vue) {
        $('perf-preparation').hidden = vue !== 'preparation';
        $('perf-session').hidden = vue !== 'session';
        $('perf-fin').hidden = vue !== 'fin';
    }

    // Avant de démarrer : liste des véhicules, ou création du premier
    async function preparer() {
        const vehicules = await stockage.listerVehicules();
        const dernier = await stockage.lireDernierVehicule();
        remplirVehicules($('perf-vehicule'), vehicules, dernier);
        $('perf-choix-vehicule').hidden = !vehicules.length;
        $('perf-nouveau-vehicule').hidden = vehicules.length > 0;
        $('perf-demarrer').disabled = !vehicules.length;
        afficherVue('preparation');
    }

    $('perf-nouveau-vehicule').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nom = $('perf-nom-vehicule').value.trim();
        if (!nom) return;
        const vehicule = await stockage.creerVehicule(nom);
        await stockage.memoriserDernierVehicule(vehicule.id);
        $('perf-nom-vehicule').value = '';
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

    $('perf-demarrer').addEventListener('click', () => {
        const vehiculeId = $('perf-vehicule').value;
        if (!vehiculeId || session) return;
        stockage.memoriserDernierVehicule(vehiculeId);
        session = creerSession(vehiculeId);
        detecteur = new Detecteur();
        abandonJusqua = 0;
        modifiee = true;
        enregistrer();
        minuterieEnregistrement = setInterval(enregistrer, INTERVALLE_ENREGISTREMENT_MS);
        $('perf-vitesse').textContent = '—';
        $('perf-resultat').textContent = '—';
        afficherEvenements();
        afficherIndicateur();
        afficherVue('session');
    });

    $('perf-arreter').addEventListener('click', async () => {
        detecteur = null;  // plus aucun point n'est ajouté
        clearInterval(minuterieEnregistrement);
        clearTimeout(minuterieAbandon);
        modifiee = true;
        await enregistrer();
        const n = session.evenements.length;
        $('perf-bilan').textContent = `Session enregistrée : ${n} évènement${n > 1 ? 's' : ''}.`;
        $('perf-note').value = '';
        afficherVue('fin');
    });

    // Fin de session : note facultative
    $('perf-fin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const note = $('perf-note').value.trim();
        if (note) {
            session.note = note;
            modifiee = true;
            await enregistrer();
        }
        session = null;
        await preparer();
    });

    // Enregistrement immédiat si l'appli passe en arrière-plan (elle peut y être tuée)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') enregistrer();
    });

    // Chaque point, avec ou sans fix, est stocké et passé au détecteur
    source.addEventListener('point', (e) => {
        if (!detecteur) return;
        const point = e.detail;
        session.points.push(point);
        modifiee = true;
        const { evenements, abandon } = detecteur.ajouter(point);
        if (evenements.length) {
            session.evenements.push(...evenements);
            $('perf-resultat').textContent = formaterResultat(evenements.at(-1));
            $('perf-resultat').classList.toggle('douteux', evenements.at(-1).douteux);
            afficherEvenements();
        }
        if (abandon) {
            abandonJusqua = performance.now() + DUREE_ABANDON_MS;
            clearTimeout(minuterieAbandon);
            minuterieAbandon = setTimeout(afficherIndicateur, DUREE_ABANDON_MS);
        }
        $('perf-vitesse').textContent = point.fix ? Math.round(point.vitesse) : '—';
        afficherIndicateur();
    });

    // Une mesure en cours (lancer ou freinage) passe avant l'affichage de l'abandon
    function afficherIndicateur() {
        if (!detecteur) return;
        const etat = detecteur.lancer || detecteur.freinage ? 'en-cours'
            : performance.now() < abandonJusqua ? 'abandon'
            : detecteur.etat;
        $('perf-indicateur').dataset.etat = etat;
        $('perf-indicateur').textContent = LIBELLES_ETAT[etat];
    }

    // Du plus récent au plus ancien
    function afficherEvenements() {
        $('perf-evenements').replaceChildren(...session.evenements.toReversed().map((evenement) => element('li',
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
    };
}
