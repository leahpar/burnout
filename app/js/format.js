// Mise en forme des valeurs affichées : temps avec deux décimales et une virgule, vitesses en km/h,
// distances en m

const decimales = (valeur, n) => valeur.toFixed(n).replace('.', ',');

export const formaterDuree = (secondes) => `${decimales(secondes, 2)} s`;
export const formaterVitesse = (kmh) => `${Math.round(kmh)} km/h`;
export const formaterDistance = (metres) => `${Math.round(metres)} m`;

// « 0-100 : 7,84 s »
export const formaterResultat = (evenement) => `${evenement.nom} : ${formaterDuree(evenement.duree)}`;

// Distance de freinage pour le 100-0, vitesse de sortie pour le 0-400 m, rien pour les autres
export function formaterComplement(evenement) {
    if (evenement.nom === '100-0') return formaterDistance(evenement.distance);
    if (evenement.nom === '0-400 m') return `sortie à ${formaterVitesse(evenement.vitesse)}`;
    return '';
}

// Date et heure locales du téléphone, par exemple « 09/11/2026 14:05 »
export function formaterDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}
