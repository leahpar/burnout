// Décodage de la trame BLE v1 (20 octets, little-endian), voir TramePoint dans firmware/src/main.cpp

export const TRAME_VERSION = 1;
export const TRAME_TAILLE = 20;

// Accepte un DataView, un ArrayBuffer ou un tableau typé. Lève une erreur si la trame est invalide.
export function decoderTrame(donnees) {
    const vue = donnees instanceof DataView ? donnees
        : ArrayBuffer.isView(donnees) ? new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength)
        : new DataView(donnees);
    if (vue.byteLength !== TRAME_TAILLE) throw new Error(`trame de ${vue.byteLength} octets au lieu de ${TRAME_TAILLE}`);
    const version = vue.getUint8(0);
    if (version !== TRAME_VERSION) throw new Error(`version de trame ${version} inconnue`);

    const drapeaux = vue.getUint8(1);
    const hdop10 = vue.getUint8(3);
    return {
        fix: (drapeaux & 0x01) !== 0,
        heureValide: (drapeaux & 0x02) !== 0,
        satellites: vue.getUint8(2),
        hdop: hdop10 === 255 ? null : hdop10 / 10,
        msJour: vue.getUint32(4, true),
        vitesse: vue.getUint16(8, true) / 100,  // km/h
        altitude: vue.getInt16(10, true),       // m
        latitude: vue.getInt32(12, true) / 1e7,  // degrés
        longitude: vue.getInt32(16, true) / 1e7,
    };
}
