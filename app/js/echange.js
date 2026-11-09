// Export et import JSON des sessions et des véhicules. Sans dépendance au DOM ni au stockage.
// Fichier : { format: 'burnout', version, exporte (ISO), vehicules: [{ id, nom, note }], sessions: [session complète] }

export const FORMAT = 'burnout';
export const VERSION_FICHIER = 1;

// Fichier d'export des sessions données, avec les seuls véhicules qu'elles utilisent
export function creerExport(sessions, vehicules, date = new Date()) {
    const utilises = new Set(sessions.map((s) => s.vehiculeId));
    return {
        format: FORMAT,
        version: VERSION_FICHIER,
        exporte: date.toISOString(),
        vehicules: vehicules.filter((v) => utilises.has(v.id)),
        sessions,
    };
}

// Nom du fichier : burnout-2026-11-09.json pour tout l'historique, burnout-session-2026-11-09-14h05.json
// pour une session (heure locale du début)
export function nomFichier(session = null, date = new Date()) {
    const d = session ? new Date(session.debut) : date;
    const deux = (n) => String(n).padStart(2, '0');
    const jour = `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
    return session ? `burnout-session-${jour}-${deux(d.getHours())}h${deux(d.getMinutes())}.json` : `burnout-${jour}.json`;
}

const texte = (v) => typeof v === 'string' && v !== '';

// Lit et vérifie le contenu d'un fichier ; exception avec un message lisible s'il n'est pas valable
export function lireFichier(contenu) {
    let fichier;
    try {
        fichier = JSON.parse(contenu);
    } catch {
        throw new Error('ce n\'est pas un fichier JSON');
    }
    if (fichier?.format !== FORMAT) throw new Error('ce n\'est pas un fichier exporté par burnout');
    if (!Number.isInteger(fichier.version) || fichier.version > VERSION_FICHIER) {
        throw new Error(`version ${fichier.version} du fichier non prise en charge, mettre l'appli à jour`);
    }
    if (!Array.isArray(fichier.vehicules) || !Array.isArray(fichier.sessions)) throw new Error('fichier incomplet');
    for (const v of fichier.vehicules) {
        if (!texte(v?.id) || !texte(v.nom)) throw new Error('véhicule sans identifiant ou sans nom');
    }
    const vehicules = new Set(fichier.vehicules.map((v) => v.id));
    for (const s of fichier.sessions) {
        if (!texte(s?.id) || !texte(s.debut) || !Array.isArray(s.points) || !Array.isArray(s.evenements)) {
            throw new Error('session incomplète');
        }
        if (!vehicules.has(s.vehiculeId)) throw new Error('session dont le véhicule est absent du fichier');
    }
    return fichier;
}

// Fusion par identifiant, sans doublon : ce qui existe déjà localement est conservé tel quel.
// Renvoie ce qu'il faut ajouter et le nombre de sessions déjà présentes.
export function fusionner(fichier, { vehicules, sessions }) {
    const vehiculesConnus = new Set(vehicules);
    const sessionsConnues = new Set(sessions);
    const nouvellesSessions = fichier.sessions.filter((s) => !sessionsConnues.has(s.id));
    return {
        vehicules: fichier.vehicules
            .filter((v) => !vehiculesConnus.has(v.id))
            .map(({ id, nom, note = '' }) => ({ id, nom, note })),
        sessions: nouvellesSessions.map((s) => ({ note: '', ...s })),
        dejaPresentes: fichier.sessions.length - nouvellesSessions.length,
    };
}
