// Écran Réglages : véhicules, export et import, seuils de détection (lecture seule), mode développeur

import { SEUILS } from './detection.js';
import * as stockage from './stockage.js';
import { creerExport, lireFichier, nomFichier } from './echange.js';
import { $, element, telechargerJson } from './dom.js';

const CLE_MODE_DEVELOPPEUR = 'burnout.modeDeveloppeur';

const nombre = (valeur) => valeur.toLocaleString('fr-FR');
const LIBELLES_SEUILS = {
    arret: ['Seuil d\'arrêt et de départ', (v) => `${nombre(v)} km/h`],
    dureeArret: ['Durée d\'arrêt pour être prêt', (v) => `${nombre(v / 1000)} s`],
    marge: ['Marge d\'abandon', (v) => `${nombre(v)} km/h`],
    stagnation: ['Stagnation provoquant l\'abandon', (v) => `${nombre(v / 1000)} s sans gagner 1 km/h`],
    trou: ['Trou de données rendant douteux', (v) => `> ${nombre(v)} ms`],
    hdop: ['HDOP rendant douteux', (v) => `> ${nombre(v)}`],
};

export const modeDeveloppeur = () => localStorage.getItem(CLE_MODE_DEVELOPPEUR) === '1';

// surModeDeveloppeur(actif) est appelée à chaque changement de la case
export function initialiserReglages({ surModeDeveloppeur }) {
    async function afficherVehicules() {
        const [vehicules, sessions] = await Promise.all([stockage.listerVehicules(), stockage.listerSessions()]);
        $('reg-vehicules').replaceChildren(...vehicules.map((vehicule) => {
            const nbSessions = sessions.filter((s) => s.vehiculeId === vehicule.id).length;
            const nom = element('input', { value: vehicule.nom, required: true });
            const note = element('input', { value: vehicule.note });
            const supprimer = element('button', { type: 'button', className: 'bouton-danger', textContent: 'Supprimer' });
            const formulaire = element('form', { className: 'pile carte' },
                element('label', { className: 'champ' }, 'Nom ', nom),
                element('label', { className: 'champ' }, 'Note ', note),
                element('p', { className: 'discret', textContent: `${nbSessions} session${nbSessions > 1 ? 's' : ''}` }),
                element('div', { className: 'boutons' },
                    element('button', { type: 'submit', textContent: 'Enregistrer' }),
                    supprimer),
            );
            formulaire.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!nom.value.trim()) return;
                await stockage.enregistrerVehicule({ id: vehicule.id, nom: nom.value.trim(), note: note.value.trim() });
                await afficherVehicules();
            });
            supprimer.addEventListener('click', async () => {
                if (nbSessions) {
                    alert(`Suppression impossible : ce véhicule a ${nbSessions} session${nbSessions > 1 ? 's' : ''}.`);
                    return;
                }
                if (!confirm(`Supprimer le véhicule « ${vehicule.nom} » ?`)) return;
                try {
                    await stockage.supprimerVehicule(vehicule.id);
                } catch (erreur) {
                    alert(`Suppression impossible : ${erreur.message}.`);
                }
                await afficherVehicules();
            });
            return element('li', {}, formulaire);
        }));
    }

    $('reg-ajout').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nom = $('reg-nom').value.trim();
        if (!nom) return;
        await stockage.creerVehicule(nom, $('reg-note').value.trim());
        $('reg-nom').value = '';
        $('reg-note').value = '';
        await afficherVehicules();
    });

    $('reg-exporter').addEventListener('click', async () => {
        const sessions = await stockage.lireToutesSessions();
        if (!sessions.length) {
            alert('Aucune session à exporter.');
            return;
        }
        telechargerJson(nomFichier(), creerExport(sessions, await stockage.listerVehicules()));
    });

    $('reg-importer').addEventListener('click', () => $('reg-fichier').click());
    $('reg-fichier').addEventListener('change', async () => {
        const [fichier] = $('reg-fichier').files;
        $('reg-fichier').value = '';
        if (!fichier) return;
        try {
            const bilan = await stockage.importer(lireFichier(await fichier.text()));
            const s = (n) => (n > 1 ? 's' : '');
            const compte = (n, nom, qualificatif) => `${n} ${nom}${s(n)} ${qualificatif}${s(n)}`;
            alert([
                compte(bilan.sessions, 'session', 'importée'),
                bilan.dejaPresentes && compte(bilan.dejaPresentes, 'session', 'déjà présente'),
                bilan.vehicules && compte(bilan.vehicules, 'véhicule', 'ajouté'),
            ].filter(Boolean).join(', ') + '.');
        } catch (erreur) {
            alert(`Import impossible : ${erreur.message}.`);
        }
        await afficherVehicules();
    });

    $('reg-seuils').replaceChildren(...Object.entries(SEUILS).map(([cle, valeur]) => {
        const [libelle, formater] = LIBELLES_SEUILS[cle] ?? [cle, String];
        return element('div', {}, element('dt', { textContent: libelle }), element('dd', { textContent: formater(valeur) }));
    }));

    $('reg-dev').checked = modeDeveloppeur();
    $('reg-dev').addEventListener('change', () => {
        localStorage.setItem(CLE_MODE_DEVELOPPEUR, $('reg-dev').checked ? '1' : '0');
        surModeDeveloppeur($('reg-dev').checked);
    });

    return { afficher: afficherVehicules };
}
