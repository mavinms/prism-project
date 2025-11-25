import sqlite3
import json
import os

def extract_database_info():
    """Extract complete database schema and sample data"""
    
    # Get database path
    db_path = os.path.join(os.path.dirname(__file__), 'prism.sqlite')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    output = {
        'database_path': db_path,
        'tables': {}
    }
    
    # Get all table names
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    
    print(f"📊 Found {len(tables)} tables in database\n")
    
    for table in tables:
        print(f"🔍 Processing table: {table}")
        
        # Get table schema
        cursor.execute(f"PRAGMA table_info({table})")
        columns = cursor.fetchall()
        
        schema = []
        for col in columns:
            schema.append({
                'name': col['name'],
                'type': col['type'],
                'not_null': bool(col['notnull']),
                'default_value': col['dflt_value'],
                'primary_key': bool(col['pk'])
            })
        
        # Get foreign keys
        cursor.execute(f"PRAGMA foreign_key_list({table})")
        foreign_keys = [dict(row) for row in cursor.fetchall()]
        
        # Get indexes
        cursor.execute(f"PRAGMA index_list({table})")
        indexes = [dict(row) for row in cursor.fetchall()]
        
        # Get sample data (first 3 rows)
        cursor.execute(f"SELECT * FROM {table} LIMIT 3")
        sample_rows = [dict(row) for row in cursor.fetchall()]
        
        # Get row count
        cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
        row_count = cursor.fetchone()['count']
        
        output['tables'][table] = {
            'row_count': row_count,
            'schema': schema,
            'foreign_keys': foreign_keys,
            'indexes': indexes,
            'sample_data': sample_rows
        }
    
    conn.close()
    
    # Save to JSON file
    output_file = 'database_schema.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, default=str)
    
    print(f"\n✅ Database schema exported to: {output_file}")
    print(f"\n📋 Summary:")
    print(f"   Total tables: {len(tables)}")
    for table, info in output['tables'].items():
        print(f"   - {table}: {info['row_count']} rows, {len(info['schema'])} columns")

if __name__ == '__main__':
    extract_database_info()