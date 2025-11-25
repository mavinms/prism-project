import os
import sys
import json
import sqlite3
from flask import Flask, send_from_directory, request, jsonify
from datetime import datetime
import atexit

app = Flask(__name__)

# Ensure clean shutdown
def cleanup():
    """Cleanup function to ensure all resources are released"""
    try:
        pass
    except:
        pass

atexit.register(cleanup)

# Database path
if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_PATH = os.path.join(BASE_DIR, 'prism.sqlite')

def get_db():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        return None
    return sqlite3.connect(DB_PATH)

def init_db():
    """Initialize new tables for enhanced features"""
    db = get_db()
    if not db:
        return
    
    cursor = db.cursor()
    
    # User term metadata table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_term_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            term TEXT NOT NULL,
            user_id TEXT DEFAULT 'local',
            favorite INTEGER DEFAULT 0,
            bookmark INTEGER DEFAULT 0,
            difficulty TEXT DEFAULT 'unknown',
            rating INTEGER DEFAULT 0,
            read_status TEXT DEFAULT 'to-read',
            personal_tags TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            last_viewed TIMESTAMP,
            UNIQUE(term, user_id)
        )
    """)
    
    # Saved tests table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS saved_tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            creator TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            config_json TEXT
        )
    """)
    
    # Test questions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS test_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER,
            term TEXT,
            question_json TEXT,
            seq INTEGER,
            FOREIGN KEY(test_id) REFERENCES saved_tests(id)
        )
    """)
    
    # Test attempts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS test_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER,
            user_id TEXT,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            answers_json TEXT,
            score REAL,
            status TEXT DEFAULT 'in-progress',
            FOREIGN KEY(test_id) REFERENCES saved_tests(id)
        )
    """)
    
    db.commit()
    db.close()

# Initialize database on startup
init_db()

@app.route('/')
def index():
    return send_from_directory('web', 'index.html')

@app.route('/web/<path:filename>')
def serve_static(filename):
    return send_from_directory('web', filename)

@app.route('/api/terms', methods=['GET'])
def get_all_terms():
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("SELECT term, subject FROM terms_data ORDER BY subject, term")
        rows = cursor.fetchall()
        db.close()
        
        terms = [{'term': row[0], 'subject': row[1]} for row in rows]
        return jsonify(terms)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/subjects', methods=['GET'])
def get_subjects():
    """Get all unique subjects with term counts"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            SELECT subject, COUNT(*) as count 
            FROM terms_data 
            GROUP BY subject 
            ORDER BY subject
        """)
        rows = cursor.fetchall()
        db.close()
        
        subjects = [{'subject': row[0], 'count': row[1]} for row in rows]
        return jsonify(subjects)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/terms/subject/<subject>', methods=['GET'])
def get_terms_by_subject(subject):
    """Get all terms for a specific subject"""
    try:
        from urllib.parse import unquote
        subject = unquote(subject)
        
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            SELECT term, subject 
            FROM terms_data 
            WHERE subject = ? 
            ORDER BY term
        """, (subject,))
        rows = cursor.fetchall()
        db.close()
        
        terms = [{'term': row[0], 'subject': row[1]} for row in rows]
        return jsonify(terms)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/term/<path:term_name>', methods=['GET'])
def get_term_data(term_name):
    try:
        from urllib.parse import unquote
        term_name = unquote(term_name)
        
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            SELECT term, subject, definition, keyPoints_str, example, 
                   objective_qa_json, descriptive_qa_json, quiz_data_json
            FROM terms_data WHERE term = ?
        """, (term_name,))
        
        row = cursor.fetchone()
        
        if not row:
            db.close()
            return jsonify({'error': f'Term "{term_name}" not found in database'}), 404
        
        # Get metadata
        cursor.execute("""
            SELECT favorite, bookmark, difficulty, rating, read_status, 
                   personal_tags, notes, last_viewed
            FROM user_term_meta 
            WHERE term = ? AND user_id = 'local'
        """, (term_name,))
        meta_row = cursor.fetchone()
        
        # Update last viewed
        cursor.execute("""
            INSERT OR REPLACE INTO user_term_meta 
            (term, user_id, favorite, bookmark, difficulty, rating, read_status, 
             personal_tags, notes, last_viewed)
            VALUES (?, 'local', ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            term_name,
            meta_row[0] if meta_row else 0,
            meta_row[1] if meta_row else 0,
            meta_row[2] if meta_row else 'unknown',
            meta_row[3] if meta_row else 0,
            meta_row[4] if meta_row else 'to-read',
            meta_row[5] if meta_row else '',
            meta_row[6] if meta_row else '',
            datetime.now().isoformat()
        ))
        db.commit()
        db.close()
        
        keyPoints = [p.strip() for p in row[3].split('||') if p.strip()] if row[3] else []
        
        data = {
            'term': row[0],
            'subject': row[1],
            'definition': row[2] or '',
            'keyPoints': keyPoints,
            'example': row[4] or '',
            'objective_qa': json.loads(row[5] or '[]'),
            'descriptive_qa': json.loads(row[6] or '[]'),
            'quiz_data': json.loads(row[7] or '[]'),
            'meta': {
                'favorite': meta_row[0] if meta_row else 0,
                'bookmark': meta_row[1] if meta_row else 0,
                'difficulty': meta_row[2] if meta_row else 'unknown',
                'rating': meta_row[3] if meta_row else 0,
                'read_status': meta_row[4] if meta_row else 'to-read',
                'personal_tags': meta_row[5] if meta_row else '',
                'notes': meta_row[6] if meta_row else '',
                'last_viewed': meta_row[7] if meta_row else None
            }
        }
        
        return jsonify(data)
    except Exception as e:
        print(f"Error fetching term '{term_name}': {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/term/meta', methods=['POST'])
def save_term_meta():
    """Save or update term metadata"""
    try:
        data = request.json
        term = data.get('term')
        user_id = data.get('user_id', 'local')
        
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        
        # Get existing meta
        cursor.execute("""
            SELECT favorite, bookmark, difficulty, rating, read_status, 
                   personal_tags, notes
            FROM user_term_meta 
            WHERE term = ? AND user_id = ?
        """, (term, user_id))
        existing = cursor.fetchone()
        
        # Merge with new data
        favorite = data.get('favorite', existing[0] if existing else 0)
        bookmark = data.get('bookmark', existing[1] if existing else 0)
        difficulty = data.get('difficulty', existing[2] if existing else 'unknown')
        rating = data.get('rating', existing[3] if existing else 0)
        read_status = data.get('read_status', existing[4] if existing else 'to-read')
        personal_tags = data.get('personal_tags', existing[5] if existing else '')
        notes = data.get('notes', existing[6] if existing else '')
        
        cursor.execute("""
            INSERT OR REPLACE INTO user_term_meta 
            (term, user_id, favorite, bookmark, difficulty, rating, read_status, 
             personal_tags, notes, last_viewed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (term, user_id, favorite, bookmark, difficulty, rating, read_status,
              personal_tags, notes, datetime.now().isoformat()))
        
        db.commit()
        db.close()
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/term/meta/<path:term>', methods=['GET'])
def get_term_meta(term):
    """Get term metadata"""
    try:
        from urllib.parse import unquote
        term = unquote(term)
        user_id = request.args.get('user_id', 'local')
        
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            SELECT favorite, bookmark, difficulty, rating, read_status, 
                   personal_tags, notes, last_viewed
            FROM user_term_meta 
            WHERE term = ? AND user_id = ?
        """, (term, user_id))
        
        row = cursor.fetchone()
        db.close()
        
        if row:
            return jsonify({
                'favorite': row[0],
                'bookmark': row[1],
                'difficulty': row[2],
                'rating': row[3],
                'read_status': row[4],
                'personal_tags': row[5],
                'notes': row[6],
                'last_viewed': row[7]
            })
        else:
            return jsonify({
                'favorite': 0,
                'bookmark': 0,
                'difficulty': 'unknown',
                'rating': 0,
                'read_status': 'to-read',
                'personal_tags': '',
                'notes': '',
                'last_viewed': None
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tests', methods=['POST'])
def create_test():
    """Create a new test"""
    try:
        data = request.json
        
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            INSERT INTO saved_tests (name, description, creator, config_json)
            VALUES (?, ?, ?, ?)
        """, (data['name'], data.get('description', ''), 
              data.get('creator', 'local'), json.dumps(data['config'])))
        
        test_id = cursor.lastrowid
        db.commit()
        db.close()
        
        return jsonify({'success': True, 'test_id': test_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tests/<int:test_id>/generate', methods=['POST'])
def generate_test_questions(test_id):
    """Generate questions for a test based on filters"""
    try:
        data = request.json
        filters = data.get('filters', {})
        sections = data.get('sections', [])
        
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        
        # Build query based on filters
        query = "SELECT term, subject FROM terms_data WHERE 1=1"
        params = []
        
        if filters.get('subject'):
            query += " AND subject = ?"
            params.append(filters['subject'])
        
        if filters.get('difficulty'):
            # Join with metadata for difficulty filter
            query = """
                SELECT t.term, t.subject 
                FROM terms_data t
                LEFT JOIN user_term_meta m ON t.term = m.term
                WHERE 1=1
            """
            if filters.get('subject'):
                query += " AND t.subject = ?"
            query += " AND m.difficulty = ?"
            params.append(filters['difficulty'])
        
        query += " ORDER BY RANDOM()"
        
        cursor.execute(query, params)
        available_terms = cursor.fetchall()
        
        # Generate questions for each section
        seq = 0
        for section in sections:
            section_type = section['type']
            count = section['count']
            
            for i in range(min(count, len(available_terms))):
                term, subject = available_terms[i]
                
                # Get term data
                cursor.execute("""
                    SELECT objective_qa_json, descriptive_qa_json, quiz_data_json,
                           definition, keyPoints_str, example
                    FROM terms_data WHERE term = ?
                """, (term,))
                term_data = cursor.fetchone()
                
                question = None
                if section_type == 'objective' and term_data[0]:
                    qa_list = json.loads(term_data[0])
                    if qa_list:
                        question = qa_list[0]
                elif section_type == 'descriptive' and term_data[1]:
                    qa_list = json.loads(term_data[1])
                    if qa_list:
                        question = qa_list[0]
                elif section_type == 'quiz' and term_data[2]:
                    quiz_list = json.loads(term_data[2])
                    if quiz_list:
                        question = quiz_list[0]
                elif section_type == 'definition':
                    question = {
                        'question': f"Define: {term}",
                        'answer': term_data[3]
                    }
                elif section_type == 'keypoints':
                    question = {
                        'question': f"List key points about: {term}",
                        'answer': term_data[4]
                    }
                elif section_type == 'example':
                    question = {
                        'question': f"Provide an example of: {term}",
                        'answer': term_data[5]
                    }
                
                if question:
                    cursor.execute("""
                        INSERT INTO test_questions (test_id, term, question_json, seq)
                        VALUES (?, ?, ?, ?)
                    """, (test_id, term, json.dumps(question), seq))
                    seq += 1
        
        db.commit()
        db.close()
        
        return jsonify({'success': True, 'questions_generated': seq})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tests', methods=['GET'])
def get_tests():
    """Get all saved tests"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            SELECT id, name, description, creator, created_at, config_json
            FROM saved_tests
            ORDER BY created_at DESC
        """)
        rows = cursor.fetchall()
        db.close()
        
        tests = [{
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'creator': row[3],
            'created_at': row[4],
            'config': json.loads(row[5])
        } for row in rows]
        
        return jsonify(tests)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats/overview', methods=['GET'])
def get_stats_overview():
    """Get overview statistics"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        
        # Total terms
        cursor.execute("SELECT COUNT(*) FROM terms_data")
        total_terms = cursor.fetchone()[0]
        
        # Favorite terms
        cursor.execute("SELECT COUNT(*) FROM user_term_meta WHERE favorite = 1")
        favorite_count = cursor.fetchone()[0]
        
        # Bookmarked terms
        cursor.execute("SELECT COUNT(*) FROM user_term_meta WHERE bookmark = 1")
        bookmark_count = cursor.fetchone()[0]
        
        # Recently viewed
        cursor.execute("""
            SELECT COUNT(*) FROM user_term_meta 
            WHERE last_viewed IS NOT NULL 
            AND datetime(last_viewed) > datetime('now', '-7 days')
        """)
        recent_count = cursor.fetchone()[0]
        
        # Tests created
        cursor.execute("SELECT COUNT(*) FROM saved_tests")
        tests_count = cursor.fetchone()[0]
        
        db.close()
        
        return jsonify({
            'total_terms': total_terms,
            'favorites': favorite_count,
            'bookmarks': bookmark_count,
            'recent_views': recent_count,
            'tests_created': tests_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/meta/counts', methods=['GET'])
def get_meta_counts():
    """Get metadata counts"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        
        # Terms with notes
        cursor.execute("SELECT COUNT(*) FROM user_term_meta WHERE notes != ''")
        notes_count = cursor.fetchone()[0]
        
        # Hard terms
        cursor.execute("SELECT COUNT(*) FROM user_term_meta WHERE difficulty = 'hard'")
        hard_count = cursor.fetchone()[0]
        
        # Easy terms
        cursor.execute("SELECT COUNT(*) FROM user_term_meta WHERE difficulty = 'easy'")
        easy_count = cursor.fetchone()[0]
        
        # Medium terms
        cursor.execute("SELECT COUNT(*) FROM user_term_meta WHERE difficulty = 'medium'")
        medium_count = cursor.fetchone()[0]
        
        db.close()
        
        return jsonify({
            'with_notes': notes_count,
            'hard': hard_count,
            'easy': easy_count,
            'medium': medium_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/meta/all', methods=['GET'])
def get_all_metadata():
    """Get all term metadata for priority sorting"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        cursor.execute("""
            SELECT term, favorite, bookmark, difficulty, rating, 
                   CASE WHEN notes = '' THEN 0 ELSE 1 END as has_notes
            FROM user_term_meta
        """)
        
        rows = cursor.fetchall()
        db.close()
        
        metadata = [{
            'term': row[0],
            'favorite': row[1],
            'bookmark': row[2],
            'difficulty': row[3],
            'rating': row[4],
            'notes': row[5]
        } for row in rows]
        
        return jsonify(metadata)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/meta/filter/<filter_type>', methods=['GET'])
@app.route('/api/meta/filter/<filter_type>/<param>', methods=['GET'])
def filter_by_metadata(filter_type, param=None):
    """Filter terms by metadata"""
    try:
        db = get_db()
        if not db:
            return jsonify({'error': 'Database not found'}), 500
        
        cursor = db.cursor()
        
        if filter_type == 'favorites':
            cursor.execute("""
                SELECT t.term, t.subject 
                FROM terms_data t
                JOIN user_term_meta m ON t.term = m.term
                WHERE m.favorite = 1
                ORDER BY t.term
            """)
        elif filter_type == 'bookmarks':
            cursor.execute("""
                SELECT t.term, t.subject 
                FROM terms_data t
                JOIN user_term_meta m ON t.term = m.term
                WHERE m.bookmark = 1
                ORDER BY t.term
            """)
        elif filter_type == 'notes':
            cursor.execute("""
                SELECT t.term, t.subject 
                FROM terms_data t
                JOIN user_term_meta m ON t.term = m.term
                WHERE m.notes != ''
                ORDER BY t.term
            """)
        elif filter_type == 'difficulty' and param:
            cursor.execute("""
                SELECT t.term, t.subject 
                FROM terms_data t
                JOIN user_term_meta m ON t.term = m.term
                WHERE m.difficulty = ?
                ORDER BY t.term
            """, (param,))
        else:
            db.close()
            return jsonify({'error': 'Invalid filter type'}), 400
        
        rows = cursor.fetchall()
        db.close()
        
        terms = [{'term': row[0], 'subject': row[1]} for row in rows]
        return jsonify(terms)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    """Shutdown the Flask server"""
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        os._exit(0)
    func()
    return 'Server shutting down...'

if __name__ == '__main__':
    import webbrowser
    import threading
    import signal
    
    def open_browser():
        webbrowser.open('http://127.0.0.1:5000')
    
    def signal_handler(sig, frame):
        print('\nShutting down Prism...')
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    threading.Timer(1, open_browser).start()
    
    try:
        app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)
    except KeyboardInterrupt:
        print('\nShutting down Prism...')
        sys.exit(0)
    finally:
        import os
        os._exit(0)
