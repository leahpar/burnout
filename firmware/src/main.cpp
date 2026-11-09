// burnout — lecture du GPS NEO-6M à 5 Hz, envoi des points en BLE, suivi sur la console série

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <TinyGPSPlus.h>

constexpr int PIN_GPS_RX = 16;  // reçoit le TX du GPS
constexpr int PIN_GPS_TX = 17;  // envoie vers le RX du GPS
constexpr int PIN_LED = 2;

constexpr uint32_t GPS_BAUD_DEFAUT = 9600;
constexpr uint32_t GPS_BAUD = 38400;

constexpr const char *BLE_NOM = "burnout";
constexpr const char *BLE_SERVICE_UUID = "eb419f92-7175-43a3-ace0-c4f6bf5dfbc1";
constexpr const char *BLE_POINT_UUID = "3923262b-03b2-4f78-bc02-335185e89732";
constexpr uint8_t TRAME_VERSION = 1;

HardwareSerial &gpsSerial = Serial2;
TinyGPSPlus gps;
// Champ « statut » de RMC (A = fix, V = pas de fix) : mis à jour à chaque trame RMC, même sans fix,
// contrairement à gps.speed. Sert aussi à compter les trames pour mesurer la fréquence.
TinyGPSCustom rmcStatut(gps, "GPRMC", 2);
// Qualité du fix de GGA : GGA arrive après RMC dans chaque cycle, c'est elle qui déclenche l'envoi BLE
TinyGPSCustom ggaQualite(gps, "GPGGA", 6);
// GSV (1 Hz) : satellites visibles et rapport signal/bruit des 4 satellites décrits par chaque trame
TinyGPSCustom gsvVisibles(gps, "GPGSV", 3);
TinyGPSCustom gsvSnr[] = {{gps, "GPGSV", 7}, {gps, "GPGSV", 11}, {gps, "GPGSV", 15}, {gps, "GPGSV", 19}};

NimBLECharacteristic *blePoint = nullptr;
volatile bool bleConnecte = false;
volatile uint32_t bleConnexionMs = 0;

// Trame BLE v1 : 20 octets, little-endian, tient dans le MTU BLE par défaut (23 octets)
struct __attribute__((packed)) TramePoint {
    uint8_t version;     // TRAME_VERSION
    uint8_t drapeaux;    // bit 0 : fix valide, bit 1 : heure valide
    uint8_t satellites;  // satellites utilisés
    uint8_t hdop10;      // HDOP × 10, 255 = inconnu ou ≥ 25,5
    uint32_t msJour;     // heure GPS UTC en millisecondes depuis minuit
    uint16_t vitesse;    // km/h × 100
    int16_t altitude;    // mètres
    int32_t latitude;    // degrés × 1e7
    int32_t longitude;   // degrés × 1e7
};
static_assert(sizeof(TramePoint) == 20, "la trame BLE doit faire 20 octets");

class ServeurCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer *, NimBLEConnInfo &) override {
        bleConnecte = true;
        bleConnexionMs = millis();
        Serial.println("BLE : client connecté");
    }
    void onDisconnect(NimBLEServer *, NimBLEConnInfo &, int raison) override {
        bleConnecte = false;
        Serial.printf("BLE : client déconnecté (raison %d)\n", raison);
    }
};

// Envoie une commande NMEA propriétaire u-blox ($PUBX…) en calculant sa somme de contrôle
void envoyerPubx(const char *corps) {
    uint8_t cs = 0;
    for (const char *c = corps; *c; c++) cs ^= *c;
    char trame[96];
    snprintf(trame, sizeof(trame), "$%s*%02X\r\n", corps, cs);
    gpsSerial.print(trame);
}

// Envoie un message binaire UBX (classe, id, contenu) avec sa somme de contrôle Fletcher
void envoyerUbx(uint8_t classe, uint8_t id, const uint8_t *contenu, uint16_t taille) {
    uint8_t entete[] = {0xB5, 0x62, classe, id, (uint8_t)(taille & 0xFF), (uint8_t)(taille >> 8)};
    uint8_t ckA = 0, ckB = 0;
    for (int i = 2; i < 6; i++) { ckA += entete[i]; ckB += ckA; }
    for (int i = 0; i < taille; i++) { ckA += contenu[i]; ckB += ckA; }
    gpsSerial.write(entete, sizeof(entete));
    gpsSerial.write(contenu, taille);
    gpsSerial.write(ckA);
    gpsSerial.write(ckB);
}

// Diagnostic : compte les octets reçus du GPS à une vitesse donnée et affiche le début
void sonderGps(uint32_t vitesse) {
    gpsSerial.begin(vitesse, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
    delay(50);
    while (gpsSerial.available()) gpsSerial.read();
    char extrait[81] = {0};
    int n = 0;
    uint32_t debut = millis();
    while (millis() - debut < 1500) {
        while (gpsSerial.available()) {
            char c = gpsSerial.read();
            if (n < 80) extrait[n] = isprint(c) ? c : '.';
            n++;
        }
    }
    Serial.printf("sonde %lu bauds : %d octets reçus « %s »\n", vitesse, n, extrait);
}

// Le NEO-6M perd sa configuration sans pile de sauvegarde : on la renvoie à chaque démarrage
void configurerGps() {
    // Passage à 38400 bauds. Le module peut être resté à 38400 si seul l'ESP32 a redémarré :
    // on envoie la commande aux deux vitesses.
    const char *baud = "PUBX,41,1,0007,0003,38400,0";
    for (uint32_t vitesse : {GPS_BAUD_DEFAUT, GPS_BAUD}) {
        gpsSerial.begin(vitesse, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
        delay(100);
        envoyerPubx(baud);
        gpsSerial.flush();
        delay(100);
    }
    gpsSerial.begin(GPS_BAUD, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
    delay(100);

    // RMC et GGA à chaque mesure, GSV une mesure sur cinq (1 Hz), le reste coupé
    for (const char *corps : {"PUBX,40,GLL,0,0,0,0,0,0", "PUBX,40,GSA,0,0,0,0,0,0",
                              "PUBX,40,VTG,0,0,0,0,0,0", "PUBX,40,GSV,0,5,0,0,0,0"}) {
        envoyerPubx(corps);
    }

    // CFG-RATE : une mesure toutes les 200 ms (5 Hz), référence de temps GPS
    const uint8_t rate[] = {0xC8, 0x00, 0x01, 0x00, 0x01, 0x00};
    envoyerUbx(0x06, 0x08, rate, sizeof(rate));
}

void demarrerBle() {
    NimBLEDevice::init(BLE_NOM);
    NimBLEServer *serveur = NimBLEDevice::createServer();
    serveur->setCallbacks(new ServeurCallbacks());
    serveur->advertiseOnDisconnect(true);
    NimBLEService *service = serveur->createService(BLE_SERVICE_UUID);
    blePoint = service->createCharacteristic(BLE_POINT_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
    NimBLEAdvertising *annonce = NimBLEDevice::getAdvertising();
    annonce->setName(BLE_NOM);
    annonce->addServiceUUID(BLE_SERVICE_UUID);
    annonce->start();
}

bool fixValide() { return strcmp(rmcStatut.value(), "A") == 0; }

void envoyerPoint() {
    bool fix = fixValide();
    TramePoint t = {};
    t.version = TRAME_VERSION;
    t.drapeaux = (fix ? 0x01 : 0) | (gps.time.isValid() ? 0x02 : 0);
    t.satellites = gps.satellites.value();
    t.hdop10 = gps.hdop.isValid() ? min<uint32_t>(gps.hdop.value() / 10, 255) : 255;
    t.msJour = ((gps.time.hour() * 60 + gps.time.minute()) * 60 + gps.time.second()) * 1000UL +
               gps.time.centisecond() * 10;
    if (fix) {
        // gps.speed et gps.location gardent leur dernière valeur quand le fix est perdu : on ne les
        // envoie qu'avec un fix
        t.vitesse = lround(gps.speed.kmph() * 100);
        t.altitude = lround(gps.altitude.meters());
        t.latitude = lround(gps.location.lat() * 1e7);
        t.longitude = lround(gps.location.lng() * 1e7);
    }
    blePoint->setValue(reinterpret_cast<uint8_t *>(&t), sizeof(t));
    if (bleConnecte) blePoint->notify();
}

void afficherPoint() {
    bool fix = fixValide();
    Serial.printf("%02d:%02d:%02d.%02d fix=%s sats=%2lu hdop=%5.2f v=%6.2f km/h",
                  gps.time.hour(), gps.time.minute(), gps.time.second(), gps.time.centisecond(),
                  fix ? "A" : "V", gps.satellites.value(), gps.hdop.hdop(), gps.speed.kmph());
    if (fix) {
        Serial.printf(" lat=%.6f lon=%.6f alt=%.1f m", gps.location.lat(), gps.location.lng(),
                      gps.altitude.meters());
    }
    Serial.println();
}

void mettreAJourLed(bool fix) {
    // Trois flashs rapides à la connexion d'un client, puis clignotement lent sans fix, fixe avec fix
    uint32_t depuisConnexion = millis() - bleConnexionMs;
    bool etat;
    if (bleConnecte && depuisConnexion < 600) {
        etat = (depuisConnexion / 100) % 2 == 0;
    } else {
        etat = fix || (millis() / 500) % 2;
    }
    digitalWrite(PIN_LED, etat ? HIGH : LOW);
}

void setup() {
    Serial.begin(115200);
    pinMode(PIN_LED, OUTPUT);
    sonderGps(GPS_BAUD_DEFAUT);
    sonderGps(GPS_BAUD);
    configurerGps();
    Serial.println("burnout : GPS configuré (5 Hz, RMC + GGA, GSV à 1 Hz, 38400 bauds)");
    demarrerBle();
    Serial.printf("burnout : BLE démarré (« %s »)\n", BLE_NOM);
}

void loop() {
    static uint32_t debutFenetre = millis();
    static int trames = 0;
    static int visibles = 0;
    static int snrMax = 0;

    static char ligne[100];
    static int longueur = 0;

    while (gpsSerial.available()) {
        char c = gpsSerial.read();
        gps.encode(c);

        // Recopie brute des trames GSV sur la console : signal de chaque satellite (champs 4 à 7 :
        // numéro, élévation, azimut, rapport signal/bruit en dBHz, vide si le satellite n'est pas suivi)
        if (c == '$') longueur = 0;
        if (longueur < (int)sizeof(ligne) - 1) ligne[longueur++] = c;
        if (c == '\n') {
            ligne[longueur] = 0;
            if (strncmp(ligne, "$GPGSV", 6) == 0) Serial.print(ligne);
            longueur = 0;
        }

        if (rmcStatut.isUpdated()) {
            rmcStatut.value();  // remet isUpdated à faux
            trames++;
            afficherPoint();
        }
        if (ggaQualite.isUpdated()) {
            ggaQualite.value();
            envoyerPoint();
        }
        if (gsvVisibles.isUpdated()) {
            visibles = atoi(gsvVisibles.value());
            for (TinyGPSCustom &snr : gsvSnr) snrMax = max(snrMax, atoi(snr.value()));
        }
    }

    if (millis() - debutFenetre >= 1000) {
        Serial.printf("-- %d trames RMC/s, %d satellites visibles, meilleur signal %d dBHz "
                      "(octets reçus : %lu, erreurs de somme de contrôle : %lu)\n",
                      trames, visibles, snrMax, gps.charsProcessed(), gps.failedChecksum());
        trames = 0;
        snrMax = 0;
        debutFenetre += 1000;
    }

    mettreAJourLed(fixValide());
}
