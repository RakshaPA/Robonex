-- TrafficOS PostgreSQL Schema
-- Run: psql -U postgres -d robot_traffic -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS nodes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(50) NOT NULL,
  x           FLOAT NOT NULL,
  y           FLOAT NOT NULL,
  node_type   VARCHAR(30) DEFAULT 'normal',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lanes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(50) NOT NULL,
  from_node        UUID REFERENCES nodes(id),
  to_node          UUID REFERENCES nodes(id),
  directed         BOOLEAN DEFAULT true,
  max_speed        FLOAT DEFAULT 1.0,
  safety_level     VARCHAR(20) DEFAULT 'normal',
  lane_type        VARCHAR(30) DEFAULT 'normal',
  capacity         INT DEFAULT 2,
  congestion_score FLOAT DEFAULT 0.0,
  historical_usage INT DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS robots (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(50) NOT NULL,
  status           VARCHAR(30) DEFAULT 'idle',
  current_node     UUID REFERENCES nodes(id),
  goal_node        UUID REFERENCES nodes(id),
  x                FLOAT DEFAULT 0,
  y                FLOAT DEFAULT 0,
  speed            FLOAT DEFAULT 0,
  battery          FLOAT DEFAULT 100,
  color            VARCHAR(20),
  priority         INT DEFAULT 1,
  tasks_completed  INT DEFAULT 0,
  total_delay      FLOAT DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lane_heatmap (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lane_id   UUID REFERENCES lanes(id),
  usage     INT DEFAULT 0,
  tick      INT DEFAULT 0,
  logged_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deadlock_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  robot_ids       JSONB NOT NULL,
  detected_at     TIMESTAMP DEFAULT NOW(),
  resolved_at     TIMESTAMP,
  resolution      VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS metrics_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tick             INT,
  total_throughput INT,
  deadlock_count   INT,
  avg_speed        FLOAT,
  avg_congestion   FLOAT,
  logged_at        TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lanes_from ON lanes(from_node);
CREATE INDEX IF NOT EXISTS idx_lanes_to ON lanes(to_node);
CREATE INDEX IF NOT EXISTS idx_robots_status ON robots(status);
CREATE INDEX IF NOT EXISTS idx_heatmap_lane ON lane_heatmap(lane_id);
