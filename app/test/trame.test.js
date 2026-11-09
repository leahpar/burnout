import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decoderTrame } from '../js/trame.js';

// Construit une trame v1 à la main, champ par champ
function trame({ version = 1, drapeaux = 0, satellites = 0, hdop10 = 255, msJour = 0, vitesse = 0,
                 altitude = 0, latitude = 0, longitude = 0 } = {}) {
    const vue = new DataView(new ArrayBuffer(20));
    vue.setUint8(0, version);
    vue.setUint8(1, drapeaux);
    vue.setUint8(2, satellites);
    vue.setUint8(3, hdop10);
    vue.setUint32(4, msJour, true);
    vue.setUint16(8, vitesse, true);
    vue.setInt16(10, altitude, true);
    vue.setInt32(12, latitude, true);
    vue.setInt32(16, longitude, true);
    return vue;
}

test('trame sans fix, valeurs réelles du boîtier', () => {
    const point = decoderTrame(trame({ drapeaux: 2, msJour: 37_815_400 }));
    assert.deepEqual(point, {
        fix: false, heureValide: true, satellites: 0, hdop: null, msJour: 37_815_400,
        vitesse: 0, altitude: 0, latitude: 0, longitude: 0,
    });
});

test('trame avec fix', () => {
    const point = decoderTrame(trame({
        drapeaux: 3, satellites: 9, hdop10: 12, msJour: 86_399_800, vitesse: 10_234,
        altitude: 152, latitude: 488_566_140, longitude: 23_522_219,
    }));
    assert.equal(point.fix, true);
    assert.equal(point.heureValide, true);
    assert.equal(point.satellites, 9);
    assert.equal(point.hdop, 1.2);
    assert.equal(point.msJour, 86_399_800);
    assert.equal(point.vitesse, 102.34);
    assert.equal(point.altitude, 152);
    assert.equal(point.latitude, 48.856614);
    assert.equal(point.longitude, 2.3522219);
});

test('valeurs signées et vitesse maximale', () => {
    const point = decoderTrame(trame({ drapeaux: 1, altitude: -28, latitude: -339_249_000,
                                       longitude: -1_184_000_000, vitesse: 65_535 }));
    assert.equal(point.heureValide, false);
    assert.equal(point.altitude, -28);
    assert.equal(point.latitude, -33.9249);
    assert.equal(point.longitude, -118.4);
    assert.equal(point.vitesse, 655.35);
});

test('accepte un ArrayBuffer ou un tableau typé', () => {
    const vue = trame({ satellites: 4 });
    assert.equal(decoderTrame(vue.buffer).satellites, 4);
    assert.equal(decoderTrame(new Uint8Array(vue.buffer)).satellites, 4);
});

test('refuse une mauvaise taille ou version', () => {
    assert.throws(() => decoderTrame(new ArrayBuffer(19)), /19 octets/);
    assert.throws(() => decoderTrame(new ArrayBuffer(23)), /23 octets/);
    assert.throws(() => decoderTrame(trame({ version: 2 })), /version/);
});
