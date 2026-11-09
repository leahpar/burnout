import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerSession, meilleurEvenement, resumerSession, trierSessions, tempsContinus, donneesCourbe } from '../js/session.js';
import { detecter } from '../js/detection.js';
import { genererLancer } from '../js/generateur.js';
import { formaterDuree, formaterComplement, formaterDistance, formaterVitesse } from '../js/format.js';

test('création d\'une session : modèle attendu', () => {
    const session = creerSession('v1', new Date('2026-11-09T10:00:00Z'));
    assert.match(session.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ ...session, id: null }, {
        version: 1, id: null, vehiculeId: 'v1', debut: '2026-11-09T10:00:00.000Z', note: '', points: [], evenements: [],
    });
    assert.notEqual(creerSession('v1').id, session.id);
});

test('meilleur temps : le plus court, un douteux seulement à défaut de fiable', () => {
    const evenements = [
        { nom: '0-100', duree: 8.1, douteux: false },
        { nom: '0-100', duree: 6.5, douteux: true },
        { nom: '0-50', duree: 3.2, douteux: false },
        { nom: '0-100', duree: 7.9, douteux: false },
    ];
    assert.equal(meilleurEvenement(evenements, '0-100').duree, 7.9);
    assert.equal(meilleurEvenement(evenements, '0-50').duree, 3.2);
    assert.equal(meilleurEvenement(evenements, '100-0'), null);
    assert.equal(meilleurEvenement([{ nom: '0-100', duree: 9, douteux: true }], '0-100').duree, 9);
});

test('résumé d\'une session générée', () => {
    const { points } = genererLancer({ bruit: 0 });
    const session = { ...creerSession('v1'), points, evenements: detecter(points) };
    const resume = resumerSession(session);
    assert.deepEqual(Object.keys(resume).sort(), ['debut', 'id', 'meilleur0100', 'nbEvenements', 'vehiculeId']);
    assert.equal(resume.nbEvenements, 4);
    assert.equal(resume.meilleur0100.douteux, false);
    assert.equal(resume.meilleur0100.duree, session.evenements.find((e) => e.nom === '0-100').duree);
    assert.equal(resumerSession({ ...session, evenements: [] }).meilleur0100, null);
});

test('tri des sessions de la plus récente à la plus ancienne, filtre par véhicule', () => {
    const resumes = [
        { id: 'a', vehiculeId: 'v1', debut: '2026-11-08T10:00:00.000Z' },
        { id: 'b', vehiculeId: 'v2', debut: '2026-11-09T09:00:00.000Z' },
        { id: 'c', vehiculeId: 'v1', debut: '2026-11-09T08:00:00.000Z' },
    ];
    assert.deepEqual(trierSessions(resumes).map((r) => r.id), ['b', 'c', 'a']);
    assert.deepEqual(trierSessions(resumes, 'v1').map((r) => r.id), ['c', 'a']);
    assert.deepEqual(resumes.map((r) => r.id), ['a', 'b', 'c'], 'tableau d\'origine inchangé');
});

test('temps continus au passage de minuit', () => {
    const points = [86_399_600, 86_399_800, 0, 200].map((msJour) => ({ msJour }));
    assert.deepEqual(tempsContinus(points), [86_399_600, 86_399_800, 86_400_000, 86_400_200]);
});

test('données de la courbe : temps depuis le début, trous sans fix, intervalles alignés sur les évènements', () => {
    const debutMs = 86_400_000 - 8_000;  // passage de minuit pendant le lancer
    const { points } = genererLancer({ bruit: 0, debutMs });
    points[40] = { ...points[40], fix: false };  // pendant l'accélération
    const evenements = detecter(points);
    const { temps, vitesses, intervalles } = donneesCourbe(points, evenements);
    assert.equal(temps[0], 0);
    assert.equal(temps[1], 0.2);
    assert.ok(temps.every((t, i) => i === 0 || t > temps[i - 1]), 'temps croissants');
    assert.equal(vitesses[40], null);
    const cent = intervalles.find((i) => i.nom === '0-100');
    const evenement = evenements.find((e) => e.nom === '0-100');
    assert.ok(Math.abs(cent.fin - cent.debut - evenement.duree) < 1e-9);
    // Au début du 0-100, la vitesse vaut le seuil de départ (2 km/h) : vérification sur la courbe
    const i = temps.findIndex((t) => t > cent.debut);
    assert.ok(vitesses[i - 1] < 2 && vitesses[i] >= 2);
    assert.deepEqual(donneesCourbe([], []), { temps: [], vitesses: [], intervalles: [] });
});

test('mise en forme : deux décimales et virgule, km/h, m', () => {
    assert.equal(formaterDuree(7.8412), '7,84\u00a0s');
    assert.equal(formaterDuree(12), '12,00\u00a0s');
    assert.equal(formaterVitesse(152.6), '153\u00a0km/h');
    assert.equal(formaterDistance(48.2), '48\u00a0m');
    assert.equal(formaterComplement({ nom: '100-0', duree: 3, distance: 48.2 }), '48\u00a0m');
    assert.equal(formaterComplement({ nom: '0-400 m', duree: 15, vitesse: 151.7 }), '152\u00a0km/h');
    assert.equal(formaterComplement({ nom: '0-50', duree: 3 }), '');
});
