CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  school_case_number TEXT,
  broken_item_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  location_note TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  image_taken_year INTEGER,
  image_taken_month INTEGER,
  image_taken_day INTEGER,
  photo_key TEXT NOT NULL,
  photo_name TEXT NOT NULL,
  photo_content_type TEXT NOT NULL,
  photo_size INTEGER NOT NULL,
  save_contact_info INTEGER NOT NULL DEFAULT 0 CHECK (save_contact_info IN (0, 1)),
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  applicant_email TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
