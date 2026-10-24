-- Ivoire Sim : schéma MySQL / MariaDB
-- Import : mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS ivoire_sim CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ivoire_sim;

-- ---------- Joueurs ----------
CREATE TABLE IF NOT EXISTS players (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  email         VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  level         INT UNSIGNED NOT NULL DEFAULT 1,
  xp            INT UNSIGNED NOT NULL DEFAULT 0,
  cash          BIGINT       NOT NULL DEFAULT 100000,   -- argent liquide en FCFA
  bank          BIGINT       NOT NULL DEFAULT 0,        -- solde bancaire en FCFA
  health        TINYINT UNSIGNED NOT NULL DEFAULT 100,
  hunger        TINYINT UNSIGNED NOT NULL DEFAULT 100,
  thirst        TINYINT UNSIGNED NOT NULL DEFAULT 100,
  energy        TINYINT UNSIGNED NOT NULL DEFAULT 100,
  city_id       INT UNSIGNED NULL,
  character_model VARCHAR(32) NOT NULL DEFAULT 'Cozy_Chef',
  last_work_at  DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB;

-- ---------- Villes / quartiers ----------
CREATE TABLE IF NOT EXISTS cities (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50)  NOT NULL UNIQUE,
  tagline     VARCHAR(80)  NOT NULL,
  description TEXT         NOT NULL,
  image       VARCHAR(255) NULL
) ENGINE=InnoDB;

ALTER TABLE players
  ADD CONSTRAINT fk_players_city FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL;

-- ---------- Propriétés ----------
CREATE TABLE IF NOT EXISTS properties (
  id       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  city_id  INT UNSIGNED NOT NULL,
  name     VARCHAR(80) NOT NULL,
  type     ENUM('maison','appartement','villa') NOT NULL,
  price    BIGINT NOT NULL,
  rooms    TINYINT UNSIGNED NOT NULL DEFAULT 3,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_properties (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_id   INT UNSIGNED NOT NULL,
  property_id INT UNSIGNED NOT NULL,
  bought_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_property_owner (property_id),            -- une propriété = un seul propriétaire
  FOREIGN KEY (player_id)   REFERENCES players(id)    ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Véhicules ----------
CREATE TABLE IF NOT EXISTS vehicles (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(80) NOT NULL,
  type      ENUM('moto','voiture','taxi','minibus') NOT NULL,
  price     BIGINT NOT NULL,
  max_speed SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  fuel_tank SMALLINT UNSIGNED NOT NULL DEFAULT 50
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_vehicles (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_id  INT UNSIGNED NOT NULL,
  vehicle_id INT UNSIGNED NOT NULL,
  plate      VARCHAR(12) NOT NULL UNIQUE,
  fuel       TINYINT UNSIGNED NOT NULL DEFAULT 100,
  bought_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id)  REFERENCES players(id)  ON DELETE CASCADE,
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Emplois ----------
CREATE TABLE IF NOT EXISTS jobs (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(60) NOT NULL,
  category    ENUM('metier','entreprise') NOT NULL DEFAULT 'metier',
  daily_pay   BIGINT NOT NULL,           -- salaire par service en FCFA
  min_level   INT UNSIGNED NOT NULL DEFAULT 1,
  needs_vehicle ENUM('aucun','moto','voiture','taxi') NOT NULL DEFAULT 'aucun',
  cooldown_s  INT UNSIGNED NOT NULL DEFAULT 60,
  xp_reward   INT UNSIGNED NOT NULL DEFAULT 10
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS player_jobs (
  player_id INT UNSIGNED PRIMARY KEY,
  job_id    INT UNSIGNED NOT NULL,
  hired_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id)    REFERENCES jobs(id)    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Banque : historique des opérations ----------
CREATE TABLE IF NOT EXISTS transactions (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_id  INT UNSIGNED NOT NULL,
  kind       ENUM('depot','retrait','achat','salaire','virement_recu','virement_envoye') NOT NULL,
  amount     BIGINT NOT NULL,
  label      VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tx_player (player_id, created_at),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Messages entre joueurs (app Téléphone) ----------
CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id   INT UNSIGNED NOT NULL,
  receiver_id INT UNSIGNED NOT NULL,
  body        VARCHAR(500) NOT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_receiver (receiver_id, is_read),
  FOREIGN KEY (sender_id)   REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES players(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================
-- Données de départ
-- =====================================================
INSERT INTO cities (name, tagline, description) VALUES
('Abidjan', 'La ville moderne', 'Entre modernité et tradition, Abidjan est la plus grande ville de Côte d''Ivoire. On y trouve des immeubles, des centres commerciaux, des plages et une vie nocturne animée.'),
('Yopougon', 'Le peuple', 'Quartier populaire et vivant, célèbre pour ses maquis, sa musique et son énergie.'),
('Cocody', 'Le luxe', 'Quartier résidentiel chic : villas, ambassades, universités et restaurants haut de gamme.'),
('Marcory', 'Le business', 'Zone 4, commerces et entreprises : le cœur des affaires et des bureaux.'),
('Plateau', 'Le centre', 'Centre administratif et financier, tours et sièges des banques.'),
('Adjamé', 'Le vivant', 'Grand marché, gares routières et commerce à chaque coin de rue.');

INSERT INTO properties (city_id, name, type, price, rooms) VALUES
(3, 'Maison à Cocody',        'maison',      120000000, 5),
(3, 'Villa à Cocody',         'villa',       250000000, 7),
(4, 'Appartement à Marcory',  'appartement',  80000000, 3),
(2, 'Maison à Yopougon',      'maison',       65000000, 4),
(5, 'Appartement au Plateau', 'appartement', 150000000, 4),
(6, 'Studio à Adjamé',        'appartement',  25000000, 1);

INSERT INTO vehicles (name, type, price, max_speed, fuel_tank) VALUES
('Moto Jakarta',       'moto',     450000,   90, 12),
('Toyota Corolla',     'voiture', 6500000,  180, 50),
('Taxi Toyota Yaris',  'taxi',    4500000,  150, 40),
('Mercedes Classe C',  'voiture', 28000000, 230, 60),
('Minibus Gbaka',      'minibus', 9000000,  120, 70);

INSERT INTO jobs (title, category, daily_pay, min_level, needs_vehicle, cooldown_s, xp_reward) VALUES
('Vendeur (Boutique)',  'metier',      45000, 1, 'aucun',  60,  8),
('Livreur (Moto)',      'metier',      40000, 1, 'moto',   60,  8),
('Chauffeur (Taxi)',    'metier',      50000, 2, 'taxi',   90, 12),
('Agent de sécurité',   'metier',      50000, 2, 'aucun', 120, 12),
('Ouvrier (Chantier)',  'metier',      60000, 3, 'aucun', 120, 15),
('Gérant de maquis',    'entreprise', 120000, 5, 'aucun', 180, 25);
