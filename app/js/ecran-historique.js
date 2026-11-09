// Écran Historique : liste des sessions filtrable par véhicule, détail avec évènements, courbe, note,
// export et relecture (mode développeur)

import uPlot from '../vendor/uPlot.esm.js';
import { donneesCourbe } from './session.js';
import * as stockage from './stockage.js';
import { creerExport, nomFichier } from './echange.js';
import { modeDeveloppeur } from './ecran-reglages.js';
import { $, element, remplirVehicules, telechargerJson } from './dom.js';
import { formaterDate, formaterDuree, formaterComplement } from './format.js';

const HAUTEUR_COURBE = 260;
const COULEURS = {
    courbe: '#ff6a00',
    axes: '#9a9a9a',
    grille: '#333',
    intervalle: 'rgba(46, 204, 64, 0.15)',
    intervalleDouteux: 'rgba(255, 65, 54, 0.2)',
};

// source : SourcePoints, pour la relecture ; sessionEnCours() donne l'id de la session en cours
// d'enregistrement (absente de la liste) ; surRelecture() est appelée quand une relecture démarre
export function initialiserHistorique({ source, sessionEnCours, surRelecture }) {
    let vehicules = new Map();
    let sessionAffichee = null;
    let courbe = null;

    const nomVehicule = (id) => vehicules.get(id)?.nom ?? 'Véhicule inconnu';

    async function afficherListe() {
        fermerCourbe();
        sessionAffichee = null;
        $('hist-detail').hidden = true;
        $('hist-liste-vue').hidden = false;

        const liste = await stockage.listerVehicules();
        vehicules = new Map(liste.map((v) => [v.id, v]));
        remplirVehicules($('hist-filtre'), liste, $('hist-filtre').value, { value: '', textContent: 'Tous' });

        const sessions = (await stockage.listerSessions($('hist-filtre').value || null))
            .filter((resume) => resume.id !== sessionEnCours());
        $('hist-vide').hidden = sessions.length > 0;
        $('hist-liste').replaceChildren(...sessions.map((resume) => {
            const meilleur = resume.meilleur0100;
            const bouton = element('button', { type: 'button', className: 'session' },
                element('span', { className: 'session-date', textContent: formaterDate(resume.debut) }),
                element('span', { textContent: nomVehicule(resume.vehiculeId) }),
                element('span', { className: 'discret', textContent: `${resume.nbEvenements} évènement${resume.nbEvenements > 1 ? 's' : ''}` }),
                ...(meilleur ? [element('span', {
                    className: meilleur.douteux ? 'douteux' : '',
                    textContent: `0-100 : ${formaterDuree(meilleur.duree)}${meilleur.douteux ? ' (douteux)' : ''}`,
                })] : []),
            );
            bouton.addEventListener('click', () => afficherDetail(resume.id));
            return element('li', {}, bouton);
        }));
    }

    $('hist-filtre').addEventListener('change', afficherListe);

    async function afficherDetail(id) {
        const session = await stockage.lireSession(id);
        if (!session) return afficherListe();
        sessionAffichee = session;
        $('hist-liste-vue').hidden = true;
        $('hist-detail').hidden = false;
        $('hist-titre').textContent = `${formaterDate(session.debut)} · ${nomVehicule(session.vehiculeId)}`;
        $('hist-note').value = session.note;
        $('hist-relecture').hidden = !modeDeveloppeur();

        $('hist-sans-evenement').hidden = session.evenements.length > 0;
        $('hist-evenements').replaceChildren(...session.evenements.map((evenement) => element('tr',
            { className: evenement.douteux ? 'douteux' : '' },
            element('td', { textContent: evenement.nom }),
            element('td', { textContent: formaterDuree(evenement.duree) }),
            element('td', { textContent: [formaterComplement(evenement), evenement.douteux ? 'douteux' : ''].filter(Boolean).join(' · ') }),
        )));
        tracerCourbe(session);
    }

    // Courbe vitesse/temps, intervalles des évènements en fond (rouge s'ils sont douteux)
    function tracerCourbe(session) {
        fermerCourbe();
        const { temps, vitesses, intervalles } = donneesCourbe(session.points, session.evenements);
        if (!temps.length) return;
        const conteneur = $('hist-courbe');
        const axe = { stroke: COULEURS.axes, grid: { stroke: COULEURS.grille }, ticks: { stroke: COULEURS.grille } };
        courbe = new uPlot({
            width: conteneur.clientWidth,
            height: HAUTEUR_COURBE,
            legend: { show: false },
            cursor: { show: false },
            scales: { x: { time: false } },
            axes: [{ ...axe, label: 's' }, { ...axe, label: 'km/h' }],
            series: [{}, { stroke: COULEURS.courbe, width: 2 }],
            hooks: {
                drawClear: [(u) => {
                    const { ctx, bbox } = u;
                    ctx.save();
                    for (const intervalle of intervalles) {
                        const x0 = u.valToPos(intervalle.debut, 'x', true);
                        const x1 = u.valToPos(intervalle.fin, 'x', true);
                        ctx.fillStyle = intervalle.douteux ? COULEURS.intervalleDouteux : COULEURS.intervalle;
                        ctx.fillRect(x0, bbox.top, x1 - x0, bbox.height);
                    }
                    ctx.restore();
                }],
            },
        }, [temps, vitesses], conteneur);
    }

    function fermerCourbe() {
        courbe?.destroy();
        courbe = null;
    }

    $('hist-retour').addEventListener('click', afficherListe);

    $('hist-note-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!sessionAffichee) return;
        sessionAffichee.note = $('hist-note').value.trim();
        await stockage.enregistrerSession(sessionAffichee);
        e.submitter.textContent = 'Note enregistrée';
    });
    $('hist-note').addEventListener('input', () => {
        $('hist-note-form').querySelector('button').textContent = 'Enregistrer la note';
    });

    $('hist-exporter').addEventListener('click', () => {
        if (!sessionAffichee) return;
        telechargerJson(nomFichier(sessionAffichee), creerExport([sessionAffichee], [...vehicules.values()]));
    });

    $('hist-rejouer').addEventListener('click', () => {
        if (!sessionAffichee) return;
        source.rejouer(sessionAffichee.points, Number($('hist-facteur').value));
        surRelecture();
    });

    $('hist-supprimer').addEventListener('click', async () => {
        if (!sessionAffichee) return;
        if (!confirm('Supprimer définitivement cette session ?')) return;
        await stockage.supprimerSession(sessionAffichee.id);
        await afficherListe();
    });

    return {
        afficher: afficherListe,
        // Bouton retour d'Android : ferme le détail s'il est ouvert (renvoie false sinon)
        fermerDetail() {
            if (!sessionAffichee) return false;
            afficherListe();
            return true;
        },
    };
}
