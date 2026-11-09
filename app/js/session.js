// Sessions du mode performance : création, résumé pour la liste de l'historique, données de la courbe.
// Sans dépendance au DOM ni au stockage.

export const SESSION_VERSION = 1;
const MS_JOUR = 86_400_000;

// debut : date du téléphone au démarrage. points : tels que décodés par trame.js ; evenements : tels que
// renvoyés par Detecteur
export function creerSession(vehiculeId, debut = new Date()) {
    return {
        version: SESSION_VERSION,
        id: crypto.randomUUID(),
        vehiculeId,
        debut: debut.toISOString(),
        note: '',
        points: [],
        evenements: [],
    };
}

// Meilleur temps (durée la plus courte) pour un évènement donné, ou null. Un évènement douteux n'est
// retenu que s'il n'y en a aucun de fiable.
export function meilleurEvenement(evenements, nom) {
    const candidats = evenements.filter((e) => e.nom === nom);
    const fiables = candidats.filter((e) => !e.douteux);
    return (fiables.length ? fiables : candidats).reduce((meilleur, e) => (!meilleur || e.duree < meilleur.duree ? e : meilleur), null);
}

// Résumé stocké à part, pour lister les sessions sans charger leurs points
export function resumerSession(session) {
    const meilleur = meilleurEvenement(session.evenements, '0-100');
    return {
        id: session.id,
        vehiculeId: session.vehiculeId,
        debut: session.debut,
        nbEvenements: session.evenements.length,
        meilleur0100: meilleur && { duree: meilleur.duree, douteux: meilleur.douteux },
    };
}

// De la plus récente à la plus ancienne ; vehiculeId facultatif pour filtrer
export function trierSessions(resumes, vehiculeId = null) {
    return resumes
        .filter((r) => !vehiculeId || r.vehiculeId === vehiculeId)
        .sort((a, b) => b.debut.localeCompare(a.debut));
}

// Heures des points en ms sur une échelle continue (l'heure GPS repart de 0 à minuit), avec la même
// convention que Detecteur : le premier point garde son msJour
export function tempsContinus(points) {
    let jours = 0;
    let precedent = null;
    return points.map((p) => {
        if (precedent !== null && p.msJour + jours * MS_JOUR < precedent - MS_JOUR / 2) jours++;
        precedent = p.msJour + jours * MS_JOUR;
        return precedent;
    });
}

// Données de la courbe vitesse/temps : temps en s depuis le premier point, vitesse null sans fix (trou
// dans la courbe), intervalles des évènements sur la même échelle
export function donneesCourbe(points, evenements) {
    if (!points.length) return { temps: [], vitesses: [], intervalles: [] };
    const continus = tempsContinus(points);
    const origine = continus[0];
    return {
        temps: continus.map((t) => (t - origine) / 1000),
        vitesses: points.map((p) => (p.fix ? p.vitesse : null)),
        intervalles: evenements.map((e) => ({
            nom: e.nom, debut: (e.debut - origine) / 1000, fin: (e.fin - origine) / 1000, douteux: e.douteux,
        })),
    };
}
