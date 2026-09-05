-- wx-station server-side schema (MariaDB / InnoDB)
-- All weather data is scoped to a location so multiple stations can be
-- tracked independently from the same database.
--
-- The database is shared with a MODX 3 installation, so every table carries
-- the wx_ prefix to stay clear of MODX's own tables.

CREATE TABLE IF NOT EXISTS wx_locations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    slug VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    lat DECIMAL(9,6) NOT NULL,
    lon DECIMAL(9,6) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_wx_locations_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Single row per location, replaced on every current-conditions cron run.
CREATE TABLE IF NOT EXISTS wx_current (
    location_id INT UNSIGNED NOT NULL,
    fetched_at INT UNSIGNED NOT NULL DEFAULT 0,
    temp DECIMAL(5,2) NOT NULL DEFAULT 0,
    feels_like DECIMAL(5,2) NOT NULL DEFAULT 0,
    humidity TINYINT UNSIGNED NOT NULL DEFAULT 0,
    pressure SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    dew_point DECIMAL(5,2) NOT NULL DEFAULT 0,
    uvi DECIMAL(4,1) NOT NULL DEFAULT 0,
    wind_speed DECIMAL(5,2) NOT NULL DEFAULT 0,
    wind_deg SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    sunrise INT UNSIGNED NOT NULL DEFAULT 0,
    sunset INT UNSIGNED NOT NULL DEFAULT 0,
    weather_id SMALLINT UNSIGNED NOT NULL DEFAULT 800,
    weather_main VARCHAR(32) NOT NULL DEFAULT '',
    weather_desc VARCHAR(64) NOT NULL DEFAULT '',
    weather_icon VARCHAR(8) NOT NULL DEFAULT '',
    PRIMARY KEY (location_id),
    CONSTRAINT fk_wx_current_location FOREIGN KEY (location_id) REFERENCES wx_locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Hourly forecast, all rows replaced per location on every forecast cron run.
CREATE TABLE IF NOT EXISTS wx_hourly (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    location_id INT UNSIGNED NOT NULL,
    dt INT UNSIGNED NOT NULL,
    temp DECIMAL(5,2) NOT NULL DEFAULT 0,
    feels_like DECIMAL(5,2) NOT NULL DEFAULT 0,
    humidity TINYINT UNSIGNED NOT NULL DEFAULT 0,
    pressure SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    dew_point DECIMAL(5,2) NOT NULL DEFAULT 0,
    pop DECIMAL(4,3) NOT NULL DEFAULT 0,
    weather_id SMALLINT UNSIGNED NOT NULL DEFAULT 800,
    weather_main VARCHAR(32) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uq_wx_hourly_location_dt (location_id, dt),
    CONSTRAINT fk_wx_hourly_location FOREIGN KEY (location_id) REFERENCES wx_locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Daily forecast, all rows replaced per location on every forecast cron run.
CREATE TABLE IF NOT EXISTS wx_daily (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    location_id INT UNSIGNED NOT NULL,
    dt INT UNSIGNED NOT NULL,
    sunrise INT UNSIGNED NOT NULL DEFAULT 0,
    sunset INT UNSIGNED NOT NULL DEFAULT 0,
    moonrise INT UNSIGNED NOT NULL DEFAULT 0,
    moonset INT UNSIGNED NOT NULL DEFAULT 0,
    moon_phase DECIMAL(4,2) NOT NULL DEFAULT 0,
    temp_min DECIMAL(5,2) NOT NULL DEFAULT 0,
    temp_max DECIMAL(5,2) NOT NULL DEFAULT 0,
    weather_id SMALLINT UNSIGNED NOT NULL DEFAULT 800,
    weather_main VARCHAR(32) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    UNIQUE KEY uq_wx_daily_location_dt (location_id, dt),
    CONSTRAINT fk_wx_daily_location FOREIGN KEY (location_id) REFERENCES wx_locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Permanent observation history per location, replacing the old
-- localStorage-based log kept in the browser.
CREATE TABLE IF NOT EXISTS wx_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    location_id INT UNSIGNED NOT NULL,
    recorded_at INT UNSIGNED NOT NULL,
    temp DECIMAL(5,2) NOT NULL DEFAULT 0,
    humidity TINYINT UNSIGNED NOT NULL DEFAULT 0,
    pressure SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_wx_log_location_recorded (location_id, recorded_at),
    CONSTRAINT fk_wx_log_location FOREIGN KEY (location_id) REFERENCES wx_locations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the station's original hardcoded coordinates as the default location.
INSERT INTO wx_locations (slug, name, lat, lon)
VALUES ('default', 'Nashville, TN', 36.167546, -86.211534)
ON DUPLICATE KEY UPDATE slug = slug;
