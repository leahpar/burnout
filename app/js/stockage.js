// Stockage local dans IndexedDB (base « burnout », magasin « donnees »), via idb-keyval. Clés :
// - « vehicules » : tableau des véhicules { id, nom, note }
// - « sessions » : tableau des résumés de session (voir resumerSession), pour lister sans charger les points
// - « session:<id> » : session complète { version, id, vehiculeId, debut, note, points, evenements }
// - « dernierVehicule » : id du dernier véhicule utilisé

import { createStore, get, set, del, update } from '../vendor/idb-keyval.js';
import { resumerSession, trierSessions } from './session.js';

const base = createStore('burnout', 'donnees');
const cleSession = (id) => `session:${id}`;

// Sessions

export async function listerSessions(vehiculeId = null) {
    return trierSessions((await get('sessions', base)) ?? [], vehiculeId);
}

export const lireSession = (id) => get(cleSession(id), base);

export async function enregistrerSession(session) {
    await set(cleSession(session.id), session, base);
    const resume = resumerSession(session);
    await update('sessions', (liste = []) => [...liste.filter((r) => r.id !== session.id), resume], base);
}

export async function supprimerSession(id) {
    await update('sessions', (liste = []) => liste.filter((r) => r.id !== id), base);
    await del(cleSession(id), base);
}

// Véhicules

export async function listerVehicules() {
    return (await get('vehicules', base)) ?? [];
}

// Ajoute le véhicule ou remplace celui de même id
export async function enregistrerVehicule({ id, nom, note = '' }) {
    const vehicule = { id, nom, note };
    await update('vehicules', (liste = []) => (liste.some((v) => v.id === id)
        ? liste.map((v) => (v.id === id ? vehicule : v))
        : [...liste, vehicule]), base);
    return vehicule;
}

export const creerVehicule = (nom, note = '') => enregistrerVehicule({ id: crypto.randomUUID(), nom, note });

// Refusée (exception) tant que le véhicule a des sessions
export async function supprimerVehicule(id) {
    const nombre = (await listerSessions(id)).length;
    if (nombre) throw new Error(`ce véhicule a ${nombre} session${nombre > 1 ? 's' : ''}`);
    await update('vehicules', (liste = []) => liste.filter((v) => v.id !== id), base);
    if ((await lireDernierVehicule()) === id) await del('dernierVehicule', base);
}

export const lireDernierVehicule = () => get('dernierVehicule', base);
export const memoriserDernierVehicule = (id) => set('dernierVehicule', id, base);
