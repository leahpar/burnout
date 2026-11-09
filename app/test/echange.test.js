import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerExport, nomFichier, lireFichier, fusionner } from '../js/echange.js';
import { creerSession } from '../js/session.js';
import { genererLancer } from '../js/generateur.js';
import { detecter } from '../js/detection.js';

const clio = { id: 'v1', nom: 'Clio', note: '' };
const twingo = { id: 'v2', nom: 'Twingo', note: 'prêtée' };

function session(vehiculeId) {
    const s = creerSession(vehiculeId, new Date('2026-11-09T13:05:00Z'));
    s.points = genererLancer().points;
    s.evenements = detecter(s.points);
    return s;
}

test('export : seuls les véhicules utilisés, aller-retour JSON sans perte', () => {
    const sessions = [session('v1')];
    const fichier = creerExport(sessions, [clio, twingo], new Date('2026-11-09T15:00:00Z'));
    assert.equal(fichier.format, 'burnout');
    assert.equal(fichier.version, 1);
    assert.equal(fichier.exporte, '2026-11-09T15:00:00.000Z');
    assert.deepEqual(fichier.vehicules, [clio]);
    assert.deepEqual(lireFichier(JSON.stringify(fichier)), fichier);
});

test('nom du fichier', () => {
    assert.match(nomFichier(null, new Date(2026, 10, 9, 14, 5)), /^burnout-2026-11-09\.json$/);
    assert.match(nomFichier({ debut: new Date(2026, 10, 9, 14, 5).toISOString() }), /^burnout-session-2026-11-09-14h05\.json$/);
});

test('fichiers refusés', () => {
    const valide = creerExport([session('v1')], [clio]);
    const variante = (modif) => JSON.stringify(modif(structuredClone(valide)));
    assert.throws(() => lireFichier('pas du json'), /JSON/);
    assert.throws(() => lireFichier('{"format":"autre"}'), /burnout/);
    assert.throws(() => lireFichier(variante((f) => ({ ...f, version: 2 }))), /version 2/);
    assert.throws(() => lireFichier(variante((f) => ({ ...f, sessions: null }))), /incomplet/);
    assert.throws(() => lireFichier(variante((f) => ({ ...f, vehicules: [] }))), /véhicule est absent/);
    assert.throws(() => lireFichier(variante((f) => { delete f.sessions[0].points; return f; })), /session incomplète/);
});

test('fusion par identifiant : rien d\'écrasé, pas de doublon', () => {
    const [s1, s2] = [session('v1'), session('v2')];
    const fichier = creerExport([s1, s2], [{ ...clio, nom: 'Clio renommée' }, twingo]);
    const resultat = fusionner(fichier, { vehicules: ['v1'], sessions: [s1.id] });
    assert.deepEqual(resultat.vehicules, [twingo]);
    assert.deepEqual(resultat.sessions.map((s) => s.id), [s2.id]);
    assert.equal(resultat.dejaPresentes, 1);

    const rien = fusionner(fichier, { vehicules: ['v1', 'v2'], sessions: [s1.id, s2.id] });
    assert.deepEqual([rien.vehicules, rien.sessions, rien.dejaPresentes], [[], [], 2]);
});
