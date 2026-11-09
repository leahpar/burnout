"""Se connecte au boîtier burnout en BLE et décode les trames de points GPS.

Usage : python ble_lire.py [durée en secondes]
Depuis le sandbox Claude Code : sbx-dbus .venv/bin/python firmware/outils/ble_lire.py 10
"""

import asyncio
import struct
import sys
import time

from bleak import BleakClient, BleakScanner

NOM = "burnout"
POINT_UUID = "3923262b-03b2-4f78-bc02-335185e89732"
# Trame v1 : voir TramePoint dans firmware/src/main.cpp
FORMAT = "<BBBBIHhii"


def decoder(donnees: bytes) -> str:
    version, drapeaux, sats, hdop10, ms_jour, vitesse, alt, lat, lon = struct.unpack(FORMAT, donnees)
    h, reste = divmod(ms_jour, 3_600_000)
    m, reste = divmod(reste, 60_000)
    hdop = "?" if hdop10 == 255 else f"{hdop10 / 10:.1f}"
    fix = "A" if drapeaux & 1 else "V"
    return (f"v{version} {h:02d}:{m:02d}:{reste / 1000:06.3f} fix={fix} sats={sats:2d} hdop={hdop:>4} "
            f"v={vitesse / 100:6.2f} km/h alt={alt} m lat={lat / 1e7:.6f} lon={lon / 1e7:.6f}")


async def main(duree: float) -> None:
    appareil = await BleakScanner.find_device_by_name(NOM, timeout=10)
    if appareil is None:
        sys.exit(f"« {NOM} » introuvable")
    recues = 0

    def sur_notification(_, donnees: bytearray) -> None:
        nonlocal recues
        recues += 1
        if len(donnees) != struct.calcsize(FORMAT):
            print(f"trame de {len(donnees)} octets inattendue : {donnees.hex()}")
            return
        print(decoder(bytes(donnees)))

    async with BleakClient(appareil) as client:
        print(f"connecté à {appareil.address}, MTU {client.mtu_size}")
        await client.start_notify(POINT_UUID, sur_notification)
        debut = time.monotonic()
        await asyncio.sleep(duree)
        ecoule = time.monotonic() - debut
    print(f"{recues} trames en {ecoule:.1f} s, soit {recues / ecoule:.2f} Hz")


if __name__ == "__main__":
    asyncio.run(main(float(sys.argv[1]) if len(sys.argv) > 1 else 10))
