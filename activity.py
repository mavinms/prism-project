# activity.py
import os
import sys
import json
import sqlite3
import uuid
from datetime import datetime, date
from flask import Blueprint, request, jsonify, current_app
activity_bp = Blueprint('activity', __name__)

def now_iso():
    return datetime.now().isoformat()

# Utility: safe JSON extraction
def _json_field(obj, key, default=None):
    try:
        return obj.get(key, default)
    except Exception:
        return default

@activity_bp.route('/api/activity', methods=['POST'])
def post_activity():
    # Local import of get_db (FIX APPLIED)
    from app import get_db
    """
    Generic activity ingestion endpoint.
    Body: { event_type, event_subtype?, term_key?, subject?, payload?, user_id? }
    """
    data = request.get_json(force=True)
    event_type = _json_field(data, 'event_type')
    if not event_type:
        return jsonify({'error': 'event_type required'}), 400
    user_id = _json_field(data, 'user_id', 'local')
    event_subtype = _json_field(data, 'event_subtype')
    term_key = _json_field(data, 'term_key')
    subject = _json_field(data, 'subject')
    payload = _json_field(data, 'payload', {})

    payload_str = json.dumps(payload, default=str)

    try:
        db = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO user_activity_log
            (user_id, event_type, event_subtype, term_key, subject, payload, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (user_id, event_type, event_subtype, term_key, subject, payload_str, now_iso()))
        # update aggregates if view event
        if event_type == 'view_term':
            # increment term_view_aggregates
            cur.execute("""
                INSERT INTO term_view_aggregates (user_id, term_key, views, last_viewed)
                VALUES (?, ?, 1, ?)
                ON CONFLICT(user_id, term_key) DO UPDATE SET
                    views = views + 1,
                    last_viewed = excluded.last_viewed
            """, (user_id, term_key, now_iso()))
            # update subject aggregates (if subject provided)
            if subject:
                cur.execute("""
                    INSERT INTO subject_view_aggregates (user_id, subject, views, last_viewed)
                    VALUES (?, ?, 1, ?)
                    ON CONFLICT(user_id, subject) DO UPDATE SET
                        views = views + 1,
                        last_viewed = excluded.last_viewed
                """, (user_id, subject, now_iso()))
        db.commit()
        
        return jsonify({'success': True})
    except FileNotFoundError as fe:
        return jsonify({'error': str(fe)}), 500
    except Exception as e:
        current_app.logger.exception("Failed to record activity")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/session/start', methods=['POST'])
def start_session():
    data = request.get_json(force=True) or {}
    user_id = data.get('user_id', 'local')
    device_info = data.get('device_info', '')
    token = str(uuid.uuid4())
    started_at = now_iso()
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO user_sessions (user_id, session_token, started_at, device_info)
            VALUES (?, ?, ?, ?)
        """, (user_id, token, started_at, device_info))
        db.commit()
        
        return jsonify({'session_token': token, 'started_at': started_at})
    except Exception as e:
        current_app.logger.exception("session start failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/session/end', methods=['POST'])
def end_session():
    data = request.get_json(force=True) or {}
    token = data.get('session_token')
    duration = data.get('duration_seconds') # optional
    ended_at = now_iso()
    if not token:
        return jsonify({'error': 'session_token required'}), 400
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        # update session row
        if duration is not None:
            cur.execute("""
                UPDATE user_sessions SET ended_at = ?, duration_seconds = ?
                WHERE session_token = ?
            """, (ended_at, int(duration), token))
        else:
            # compute duration if started_at exists
            cur.execute("SELECT started_at FROM user_sessions WHERE session_token = ?", (token,))
            row = cur.fetchone()
            if row and row['started_at']:
                started = datetime.fromisoformat(row['started_at'])
                dur = int((datetime.now() - started).total_seconds())
                cur.execute("""
                    UPDATE user_sessions SET ended_at = ?, duration_seconds = ?
                    WHERE session_token = ?
                """, (ended_at, dur, token))
            else:
                cur.execute("""
                    UPDATE user_sessions SET ended_at = ?
                    WHERE session_token = ?
                """, (ended_at, token))
        db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("session end failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/search', methods=['POST'])
def post_search():
    data = request.get_json(force=True) or {}
    user_id = data.get('user_id', 'local')
    query = data.get('query', '').strip()
    results_count = int(data.get('results_count') or 0)
    clicked_term = data.get('clicked_term')
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO search_logs (user_id, query, results_count, clicked_term, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, query, results_count, clicked_term, now_iso()))
        db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("search log failed")
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# NEW/MODIFIED COLLECTION ENDPOINTS (REPLACES OLD JSON FIELD LOGIC)
# ------------------------------------------------------------------

# activity.py - Replace your existing collection management functions with this block.
# This code assumes you have 'from flask import ... current_app' and 
# the _json_field utility defined at the top of your activity.py file.

# ----------------------------------------------------------------------
# 📚 COLLECTION MANAGEMENT ENDPOINTS (FIXED FOR PERSISTENCE)
# ----------------------------------------------------------------------

@activity_bp.route('/api/collections', methods=['GET'])
def get_collections():
    """Retrieves all collections and their terms for the user."""
    user_id = request.args.get('user_id', 'local')
    from app import get_db
    db = get_db()
    cursor = db.cursor()
    
    try:
        # 1. Fetch collections
        cursor.execute("SELECT id, name FROM user_collections WHERE user_id = ? ORDER BY created_at DESC", (user_id,))
        collections_raw = [dict(row) for row in cursor.fetchall()]
        
        # 2. Fetch terms for all collections
        collections = []
        for collection in collections_raw:
            col_id = collection['id']
            cursor.execute("SELECT term FROM collection_terms WHERE collection_id = ?", (col_id,))
            terms = [row['term'] for row in cursor.fetchall()]
            
            collection['terms'] = terms
            collections.append(collection)
        
        return jsonify(collections)
        
    except Exception as e:
        current_app.logger.exception("get_collections failed")
        return jsonify({'error': str(e)}), 500


@activity_bp.route('/api/collections', methods=['POST'])
def save_collection():
    """Creates a new collection or updates an existing one (includes term replacement).
    
    CRITICAL FIX: db.commit() added to ensure data persistence.
    """
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    name = _json_field(data, 'name')
    terms = _json_field(data, 'terms', []) # List of terms in the collection
    collection_id = _json_field(data, 'id') # Optional: for updating existing
    
    if not name:
        return jsonify({'error': 'Collection name is required'}), 400

    from app import get_db
    db = get_db()
    cursor = db.cursor()
    id_to_use = collection_id

    try:
        if collection_id:
            # --- Update existing collection ---
            # 1. Update the name
            cursor.execute("UPDATE user_collections SET name = ? WHERE id = ? AND user_id = ?", (name, collection_id, user_id))
            
            # 2. Delete old terms to replace them with the new list
            cursor.execute("DELETE FROM collection_terms WHERE collection_id = ?", (collection_id,))
            
            if cursor.rowcount == 0:
                # Optional: If collection_id was provided but not found, could be an error
                current_app.logger.warning(f"Attempted to update non-existent collection ID {collection_id}")
                pass
            
            id_to_use = collection_id
            
        else:
            # --- Create new collection ---
            # Check for name collision first
            cursor.execute("SELECT 1 FROM user_collections WHERE user_id = ? AND name = ?", (user_id, name))
            if cursor.fetchone():
                return jsonify({"error": "A collection with this name already exists"}), 409
            
            # Insert the new collection
            cursor.execute("INSERT INTO user_collections (user_id, name) VALUES (?, ?)", (user_id, name))
            id_to_use = cursor.lastrowid

        # 3. Insert new terms (for both create and update)
        if id_to_use and terms:
            term_data = [(id_to_use, term) for term in terms]
            cursor.executemany("INSERT OR IGNORE INTO collection_terms (collection_id, term) VALUES (?, ?)", term_data)

        # <<< CRITICAL FIX: COMMIT THE TRANSACTION >>>
        db.commit() 
        # ---------------------------------------------
        
        return jsonify({
            'message': 'Collection saved successfully',
            'id': id_to_use,
            'name': name,
            'terms_count': len(terms)
        }), 200

    except Exception as e:
        db.rollback()
        current_app.logger.exception("save_collection failed")
        return jsonify({'error': str(e)}), 500


@activity_bp.route('/api/collections/<int:collection_id>', methods=['DELETE'])
def delete_collection(collection_id):
    """Deletes a collection. FIX: Added db.commit()"""
    user_id = request.args.get('user_id', 'local')
    from app import get_db
    db = get_db()
    cursor = db.cursor()

    try:
        # Delete the collection (ON DELETE CASCADE handles terms deletion)
        cursor.execute("DELETE FROM user_collections WHERE id = ? AND user_id = ?", (collection_id, user_id))
        
        # <<< CRITICAL FIX: COMMIT THE TRANSACTION >>>
        db.commit() 
        # ---------------------------------------------

        if cursor.rowcount == 0:
            return jsonify({"error": "Collection not found or access denied"}), 404
        
        return jsonify({'message': 'Collection deleted successfully'}), 200

    except Exception as e:
        db.rollback()
        current_app.logger.exception("delete_collection failed")
        return jsonify({'error': str(e)}), 500


@activity_bp.route('/api/collections/<int:collection_id>/terms', methods=['POST'])
def add_term_to_collection(collection_id):
    """Adds a single term to a collection. FIX: Added db.commit()"""
    from app import get_db
    db = get_db()
    cursor = db.cursor()
    
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    term = _json_field(data, 'term')
    
    if not term:
        return jsonify({'error': 'Term is required'}), 400
    
    try:
        # Check if the collection belongs to the user
        cursor.execute("SELECT 1 FROM user_collections WHERE id = ? AND user_id = ?", (collection_id, user_id))
        if cursor.fetchone() is None:
            return jsonify({"error": "Collection not found or access denied"}), 404

        # Insert the term (using INSERT OR IGNORE to handle duplicates gracefully)
        cursor.execute("INSERT OR IGNORE INTO collection_terms (collection_id, term) VALUES (?, ?)", (collection_id, term))
        
        # <<< CRITICAL FIX: COMMIT THE TRANSACTION >>>
        db.commit() 
        # ---------------------------------------------

        return jsonify({'message': f'Term {term} added successfully'}), 200

    except Exception as e:
        db.rollback()
        current_app.logger.exception("add_term_to_collection failed")
        return jsonify({'error': str(e)}), 500


@activity_bp.route('/api/collections/<int:collection_id>/terms', methods=['DELETE'])
def remove_term_from_collection(collection_id):
    """Removes a single term from a collection. FIX: Added db.commit()"""
    from app import get_db
    db = get_db()
    cursor = db.cursor()
    
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    term = _json_field(data, 'term')
    
    if not term:
        return jsonify({'error': 'Term is required'}), 400

    try:
        # Check if the collection belongs to the user
        cursor.execute("SELECT 1 FROM user_collections WHERE id = ? AND user_id = ?", (collection_id, user_id))
        if cursor.fetchone() is None:
            return jsonify({"error": "Collection not found or access denied"}), 404

        # Delete the term link
        cursor.execute("DELETE FROM collection_terms WHERE collection_id = ? AND term = ?", (collection_id, term))
        
        # <<< CRITICAL FIX: COMMIT THE TRANSACTION >>>
        db.commit() 
        # ---------------------------------------------
        
        if cursor.rowcount == 0:
            return jsonify({"error": "Term not found in collection"}), 404

        return jsonify({'message': f'Term {term} removed successfully'}), 200

    except Exception as e:
        db.rollback()
        current_app.logger.exception("remove_term_from_collection failed")
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# END NEW/MODIFIED COLLECTION ENDPOINTS
# ------------------------------------------------------------------

@activity_bp.route('/api/stats/overview', methods=['GET'])
def stats_overview():
    """
    Basic overview counts: total_terms (from terms_data), favorites, bookmarks.
    Extendable.
    """
    user_id = request.args.get('user_id', 'local')
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        # total terms (fast)
        # Note: assuming 'terms_data' table exists in your DB, as per context
        cur.execute("SELECT COUNT(*) as cnt FROM terms_data")
        # Use fetchone() check instead of rowcount for clarity/robustness with fetchone()
        row_total = cur.fetchone()
        total = row_total['cnt'] if row_total else 0

        # favorites/bookmarks/notes counts from user_term_meta
        cur.execute("""
            SELECT
              SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favorites,
              SUM(CASE WHEN bookmark = 1 THEN 1 ELSE 0 END) as bookmarks
            FROM user_term_meta WHERE user_id = ?
        """, (user_id,))
        row = cur.fetchone()
        favorites = row['favorites'] or 0
        bookmarks = row['bookmarks'] or 0

        
        return jsonify({
            'total_terms': total,
            'favorites': favorites,
            'bookmarks': bookmarks
        })
    except Exception as e:
        current_app.logger.exception("stats_overview failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/stats/top-searches', methods=['GET'])
def top_searches():
    user_id = request.args.get('user_id', 'local')
    limit = int(request.args.get('limit', 20))
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT query, COUNT(*) as times, SUM(CASE WHEN clicked_term IS NOT NULL THEN 1 ELSE 0 END) as clicks
            FROM search_logs
            WHERE user_id = ?
            GROUP BY query
            ORDER BY times DESC
            LIMIT ?
        """, (user_id, limit))
        rows = cur.fetchall()
        data = [{'query': r['query'], 'times': r['times'], 'clicks': r['clicks']} for r in rows]
        
        return jsonify(data)
    except Exception as e:
        current_app.logger.exception("top_searches failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/stats/term-group', methods=['GET'])
def term_group():
    """
    Return terms satisfying grouping filters:
    - rating=<int>
    - important_level_min=<int>
    - favorite=1
    - bookmark=1
    """
    user_id = request.args.get('user_id', 'local')
    rating = request.args.get('rating')
    important_min = request.args.get('important_level_min')
    favorite = request.args.get('favorite')
    bookmark = request.args.get('bookmark')

    conds = ["user_id = ?"]
    params = [user_id]

    if rating is not None:
        conds.append("rating = ?")
        params.append(int(rating))
    if important_min is not None:
        conds.append("important_level >= ?")
        params.append(int(important_min))
    if favorite is not None and favorite == '1':
        conds.append("favorite = 1")
    if bookmark is not None and bookmark == '1':
        conds.append("bookmark = 1")

    where = " AND ".join(conds)
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        # Assuming 'important_level' is in 'user_term_meta' as per your original request snippet context.
        q = f"SELECT term, favorite, bookmark, difficulty, rating, notes, last_viewed, important_level FROM user_term_meta WHERE {where} ORDER BY term"
        cur.execute(q, params)
        rows = cur.fetchall()
        data = []
        for r in rows:
            data.append({
                'term': r['term'],
                'favorite': r['favorite'],
                'bookmark': r['bookmark'],
                'difficulty': r['difficulty'],
                'rating': r['rating'],
                'important_level': r['important_level'] if 'important_level' in r else None,
                'notes': r['notes']
            })
        
        return jsonify(data)
    except Exception as e:
        current_app.logger.exception("term_group failed")
        return jsonify({'error': str(e)}), 500
    

# ------------------------------------------------------------------
# USER TERM METADATA ENDPOINT (Favorites, Notes, Difficulty)
# ------------------------------------------------------------------

@activity_bp.route('/api/term-meta', methods=['POST'])
def save_term_meta():
    """
    Saves or updates metadata for a single term in the user_term_meta table.
    It performs a full UPSERT, meaning the request body should include the new state of all fields being managed.
    Body: { term (required), user_id?, favorite?, bookmark?, difficulty?, rating?, notes?, important_level? }
    """
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    term = _json_field(data, 'term')
    
    if not term:
        return jsonify({'error': 'term required'}), 400
    
    # Use defaults for fields that might be missing in a partial update request
    # This assumes the client will send the full desired object state.
    favorite = _json_field(data, 'favorite', 0)
    bookmark = _json_field(data, 'bookmark', 0)
    difficulty = _json_field(data, 'difficulty', 'unknown')
    rating = _json_field(data, 'rating', 0)
    notes = _json_field(data, 'notes', '')
    important_level = _json_field(data, 'important_level', 0)
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db = get_db()
        cur = db.cursor()
        
        # INSERT OR UPDATE (UPSERT)
        cur.execute("""
            INSERT INTO user_term_meta 
                (user_id, term, favorite, bookmark, difficulty, rating, notes, important_level)
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, term) DO UPDATE SET
                favorite = excluded.favorite,
                bookmark = excluded.bookmark,
                difficulty = excluded.difficulty,
                rating = excluded.rating,
                notes = excluded.notes,
                important_level = excluded.important_level
        """, (user_id, term, favorite, bookmark, difficulty, rating, notes, important_level))

        db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        db.rollback()
        current_app.logger.exception("save_term_meta failed")
        return jsonify({'error': str(e)}), 500
    
# ------------------------------------------------------------------
# HOMEWORK ENDPOINTS (To-Do List for Terms)
# ------------------------------------------------------------------

@activity_bp.route('/api/homework', methods=['GET'])
def get_homework():
    """Fetches all homework assignments for a user."""
    user_id = request.args.get('user_id', 'local')
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db = get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT id, term, due_date, notes, added_at
            FROM homework
            WHERE user_id = ?
            ORDER BY due_date ASC, added_at DESC
        """, (user_id,))
        rows = cur.fetchall()
        
        homework_list = [dict(row) for row in rows]
        
        return jsonify(homework_list)
    except Exception as e:
        current_app.logger.exception("get_homework failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/homework', methods=['POST'])
def add_homework():
    """Adds a new homework assignment."""
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    term = _json_field(data, 'term')
    due_date = _json_field(data, 'due_date') # Expected format: YYYY-MM-DD
    notes = _json_field(data, 'notes', '')
    
    if not term or not due_date:
        return jsonify({'error': 'term and due_date are required'}), 400
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db = get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO homework (user_id, term, due_date, notes, added_at)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, term, due_date, notes, now_iso()))
        db.commit()
        
        return jsonify({'success': True, 'id': cur.lastrowid}), 201
    except Exception as e:
        db.rollback()
        current_app.logger.exception("add_homework failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/homework/<int:hid>', methods=['DELETE'])
def delete_homework(hid):
    """Deletes a homework assignment by its ID."""
    user_id = request.args.get('user_id', 'local')
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM homework WHERE id = ? AND user_id = ?", (hid, user_id))
        db.commit()
        
        if cur.rowcount == 0:
            return jsonify({'error': 'Homework item not found or unauthorized'}), 404
        
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("delete_homework failed")
        return jsonify({'error': str(e)}), 500
    

# ------------------------------------------------------------------
# USER PREFERENCES ENDPOINTS (Theme, Font, Settings)
# ------------------------------------------------------------------

@activity_bp.route('/api/preferences', methods=['GET'])
def get_preferences():
    """Get all user preferences"""
    user_id = request.args.get('user_id', 'local')
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT preference_key, preference_value, updated_at 
            FROM user_preferences 
            WHERE user_id = ?
        """, (user_id,))
        rows = cur.fetchall()
        
        # Convert to dict format
        prefs = {}
        for row in rows:
            prefs[row['preference_key']] = row['preference_value']
        
        
        return jsonify(prefs)
    except Exception as e:
        current_app.logger.exception("get_preferences failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/preferences', methods=['POST'])
def save_preference():
    """Save or update a single preference"""
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    key = _json_field(data, 'key')
    value = _json_field(data, 'value')
    
    if not key:
        return jsonify({'error': 'key required'}), 400
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("""
            INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, preference_key) DO UPDATE SET
                preference_value = excluded.preference_value,
                updated_at = excluded.updated_at
        """, (user_id, key, str(value), now_iso()))
        db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("save_preference failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/preferences/batch', methods=['POST'])
def save_preferences_batch():
    """Save multiple preferences at once"""
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    preferences = _json_field(data, 'preferences', {})
    
    if not preferences:
        return jsonify({'error': 'preferences object required'}), 400
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        timestamp = now_iso()
        
        for key, value in preferences.items():
            cur.execute("""
                INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, preference_key) DO UPDATE SET
                    preference_value = excluded.preference_value,
                    updated_at = excluded.updated_at
            """, (user_id, key, str(value), timestamp))
        
        db.commit()
        
        return jsonify({'success': True, 'count': len(preferences)})
    except Exception as e:
        current_app.logger.exception("save_preferences_batch failed")
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# RECENT TERMS ENDPOINTS (Session History)
# ------------------------------------------------------------------

@activity_bp.route('/api/recent-terms', methods=['GET'])
def get_recent_terms():
    """Get recent terms viewed by user (limited to last N)"""
    user_id = request.args.get('user_id', 'local')
    limit = int(request.args.get('limit', 10))
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("""
            SELECT term, subject, viewed_at 
            FROM user_recent_terms 
            WHERE user_id = ?
            ORDER BY viewed_at DESC
            LIMIT ?
        """, (user_id, limit))
        rows = cur.fetchall()
        
        terms = []
        for row in rows:
            terms.append({
                'term': row['term'],
                'subject': row['subject'],
                'viewed_at': row['viewed_at']
            })
        
        
        return jsonify(terms)
    except Exception as e:
        current_app.logger.exception("get_recent_terms failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/recent-terms', methods=['POST'])
def add_recent_term():
    """Add a term to recent history"""
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    term = _json_field(data, 'term')
    subject = _json_field(data, 'subject')
    
    if not term:
        return jsonify({'error': 'term required'}), 400
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        
        # Add new recent term
        cur.execute("""
            INSERT INTO user_recent_terms (user_id, term, subject, viewed_at)
            VALUES (?, ?, ?, ?)
        """, (user_id, term, subject, now_iso()))
        
        # Keep only last 50 recent terms (auto-cleanup)
        cur.execute("""
            DELETE FROM user_recent_terms 
            WHERE user_id = ? 
            AND id NOT IN (
                SELECT id FROM user_recent_terms 
                WHERE user_id = ? 
                ORDER BY viewed_at DESC 
                LIMIT 50
            )
        """, (user_id, user_id))
        
        db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("add_recent_term failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/recent-terms', methods=['DELETE'])
def clear_recent_terms():
    """Clear all recent terms for user"""
    user_id = request.args.get('user_id', 'local')
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM user_recent_terms WHERE user_id = ?", (user_id,))
        db.commit()
        
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("clear_recent_terms failed")
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# COMPREHENSIVE STATISTICS ENDPOINT (All from DB)
# ------------------------------------------------------------------

@activity_bp.route('/api/stats/complete', methods=['GET'])
def get_complete_stats():
    """Get all statistics from database (no localStorage needed)"""
    user_id = request.args.get('user_id', 'local')
    
    try:
        # Local import of get_db (FIX APPLIED)
        from app import get_db
        db=get_db()
        cur = db.cursor()
        
        stats = {}
        
        # Total terms in database
        cur.execute("SELECT COUNT(*) as cnt FROM terms_data")
        stats['total_terms'] = cur.fetchone()['cnt']
        
        # User term metadata counts
        cur.execute("""
            SELECT
                SUM(CASE WHEN favorite = 1 THEN 1 ELSE 0 END) as favorites,
                SUM(CASE WHEN bookmark = 1 THEN 1 ELSE 0 END) as bookmarks,
                SUM(CASE WHEN notes IS NOT NULL AND notes != '' THEN 1 ELSE 0 END) as with_notes,
                SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
                SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
                SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard
            FROM user_term_meta 
            WHERE user_id = ?
        """, (user_id,))
        meta_counts = cur.fetchone()
        stats['favorites'] = meta_counts['favorites'] or 0
        stats['bookmarks'] = meta_counts['bookmarks'] or 0
        stats['with_notes'] = meta_counts['with_notes'] or 0
        stats['easy'] = meta_counts['easy'] or 0
        stats['medium'] = meta_counts['medium'] or 0
        stats['hard'] = meta_counts['hard'] or 0
        
        # Recent terms count (this session)
        cur.execute("""
            SELECT COUNT(*) as cnt 
            FROM user_recent_terms 
            WHERE user_id = ?
        """, (user_id,))
        stats['recent_terms'] = cur.fetchone()['cnt']
        
        # Collections count
        cur.execute("""
            SELECT COUNT(*) as cnt 
            FROM user_collections 
            WHERE user_id = ?
        """, (user_id,))
        stats['collections'] = cur.fetchone()['cnt']
        
        # Homework count
        cur.execute("""
            SELECT COUNT(*) as cnt 
            FROM homework 
            WHERE user_id = ?
        """, (user_id,))
        stats['homework'] = cur.fetchone()['cnt']
        
        # Total views from aggregates
        cur.execute("""
            SELECT SUM(views) as total 
            FROM term_view_aggregates 
            WHERE user_id = ?
        """, (user_id,))
        result = cur.fetchone()
        stats['total_views'] = result['total'] if result['total'] else 0
        
        # Most viewed terms (top 5)
        cur.execute("""
            SELECT term_key AS term, views, last_viewed 
            FROM term_view_aggregates 
            WHERE user_id = ?
            ORDER BY views DESC 
            LIMIT 5
        """, (user_id,))
        stats['top_terms'] = [dict(row) for row in cur.fetchall()]
        
        # Subject distribution
        cur.execute("""
            SELECT subject, views 
            FROM subject_view_aggregates 
            WHERE user_id = ?
            ORDER BY views DESC
        """, (user_id,))
        stats['subject_distribution'] = [dict(row) for row in cur.fetchall()]
        
        
        return jsonify(stats)
        
    except Exception as e:
        current_app.logger.exception("get_complete_stats failed")
        return jsonify({'error': str(e)}), 500