// Petits utilitaires DOM communs aux écrans

export const $ = (id) => document.getElementById(id);

// Crée un élément : proprietes est passé à Object.assign (className, textContent, value…), les enfants
// sont des éléments ou du texte
export function element(balise, proprietes = {}, ...enfants) {
    const noeud = Object.assign(document.createElement(balise), proprietes);
    noeud.append(...enfants);
    return noeud;
}

// Remplit une liste déroulante de véhicules ; premiere : option initiale facultative { value, textContent }
export function remplirVehicules(select, vehicules, selection, premiere = null) {
    select.replaceChildren(
        ...(premiere ? [element('option', premiere)] : []),
        ...vehicules.map((v) => element('option', { value: v.id, textContent: v.nom })),
    );
    if (selection && [...select.options].some((o) => o.value === selection)) select.value = selection;
}
