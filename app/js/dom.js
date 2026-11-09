// Petits utilitaires DOM communs aux écrans

export const $ = (id) => document.getElementById(id);

// Crée un élément : proprietes est passé à Object.assign (className, textContent, value…), les enfants
// sont des éléments ou du texte
export function element(balise, proprietes = {}, ...enfants) {
    const noeud = Object.assign(document.createElement(balise), proprietes);
    noeud.append(...enfants);
    return noeud;
}

// Fait télécharger un objet sous forme de fichier JSON
export function telechargerJson(nom, objet) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(objet)], { type: 'application/json' }));
    element('a', { href: url, download: nom }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Remplit une liste déroulante de véhicules ; premiere : option initiale facultative { value, textContent }
export function remplirVehicules(select, vehicules, selection, premiere = null) {
    select.replaceChildren(
        ...(premiere ? [element('option', premiere)] : []),
        ...vehicules.map((v) => element('option', { value: v.id, textContent: v.nom })),
    );
    if (selection && [...select.options].some((o) => o.value === selection)) select.value = selection;
}
