ALTER TABLE players
  ADD COLUMN character_model VARCHAR(32) NOT NULL DEFAULT 'Cozy_Chef'
  AFTER city_id;
