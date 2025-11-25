import sqlite3
import os
from datetime import datetime

def migrate_database():
    """Add new tables for complete database-driven settings"""
    
    db_path = os.path.join(os.path.dirname(__file__), 'prism.sqlite')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        return False
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        print("🔧 Creating new tables...")
        
        # User preferences table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT NOT NULL DEFAULT 'local',
                preference_key TEXT NOT NULL,
                preference_value TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (user_id, preference_key)
            )
        """)
        
        # Recent terms table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_recent_terms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL DEFAULT 'local',
                term TEXT NOT NULL,
                subject TEXT,
                viewed_at TEXT NOT NULL
            )
        """)
        
        # Indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_recent_terms_user_time 
            ON user_recent_terms(user_id, viewed_at DESC)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_preferences_user 
            ON user_preferences(user_id)
        """)
        
        conn.commit()
        print("✅ Tables created successfully!")
        
        # Verify tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('user_preferences', 'user_recent_terms')")
        tables = cursor.fetchall()
        print(f"✅ Verified {len(tables)} new tables")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        conn.rollback()
        conn.close()
        return False

if __name__ == '__main__':
    print("🚀 Starting database migration...\n")
    success = migrate_database()
    if success:
        print("\n🎉 Migration completed! Ready to update API endpoints.")
    else:
        print("\n❌ Migration failed. Please check errors above.")