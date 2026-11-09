// Connexion Web Bluetooth au boîtier burnout, sans dépendance au DOM.
// Évènements émis : « etat » (detail : deconnecte | connexion | connecte | reconnexion)
// et « point » (detail : point décodé par trame.js).

import { decoderTrame } from './trame.js';

const SERVICE_UUID = 'eb419f92-7175-43a3-ace0-c4f6bf5dfbc1';
const POINT_UUID = '3923262b-03b2-4f78-bc02-335185e89732';
const DELAI_RECONNEXION_MS = 3000;

export const bleDisponible = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export class ConnexionBle extends EventTarget {
    etat = 'deconnecte';
    #appareil = null;
    #minuterie = null;
    // Même fonction à chaque connexion : addEventListener ne l'ajoute pas deux fois si Chrome
    // renvoie le même objet caractéristique après une reconnexion
    #ecouteur = (e) => this.#surNotification(e.target.value);

    // Doit être appelée depuis un geste utilisateur (limite de Web Bluetooth)
    async connecter() {
        this.#changerEtat('connexion');
        try {
            this.#appareil = await navigator.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
            this.#appareil.addEventListener('gattserverdisconnected', () => this.#surDeconnexion());
            await this.#ouvrir();
        } catch (erreur) {
            this.#appareil = null;
            this.#changerEtat('deconnecte');
            throw erreur;
        }
    }

    deconnecter() {
        const appareil = this.#appareil;
        this.#appareil = null;  // avant gatt.disconnect() : la déconnexion n'est pas inattendue
        clearTimeout(this.#minuterie);
        appareil?.gatt.disconnect();
        this.#changerEtat('deconnecte');
    }

    async #ouvrir() {
        const serveur = await this.#appareil.gatt.connect();
        const service = await serveur.getPrimaryService(SERVICE_UUID);
        const caracteristique = await service.getCharacteristic(POINT_UUID);
        caracteristique.addEventListener('characteristicvaluechanged', this.#ecouteur);
        await caracteristique.startNotifications();
        this.#changerEtat('connecte');
    }

    #surNotification(valeur) {
        try {
            this.dispatchEvent(new CustomEvent('point', { detail: decoderTrame(valeur) }));
        } catch (erreur) {
            console.warn('trame ignorée :', erreur.message);
        }
    }

    #surDeconnexion() {
        if (!this.#appareil) return;  // déconnexion volontaire
        this.#changerEtat('reconnexion');
        this.#planifierReconnexion();
    }

    #planifierReconnexion() {
        clearTimeout(this.#minuterie);
        this.#minuterie = setTimeout(async () => {
            if (!this.#appareil) return;
            try {
                await this.#ouvrir();
            } catch {
                if (this.#appareil) this.#planifierReconnexion();
            }
        }, DELAI_RECONNEXION_MS);
    }

    #changerEtat(etat) {
        this.etat = etat;
        this.dispatchEvent(new CustomEvent('etat', { detail: etat }));
    }
}
