# activity.py
import os
import sys
import json
import sqlite3
import uuid
from datetime import datetime, date
from flask import Blueprint, request, jsonify, current_app

activity_bp = Blueprint('activity', __name__)

# DB helper (same logic as app.py)
def get_db_conn():
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base, 'prism.sqlite')
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database not found at {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

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
        conn = get_db_conn()
        cur = conn.cursor()
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
        conn.commit()
        conn.close()
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
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO user_sessions (user_id, session_token, started_at, device_info)
            VALUES (?, ?, ?, ?)
        """, (user_id, token, started_at, device_info))
        conn.commit()
        conn.close()
        return jsonify({'session_token': token, 'started_at': started_at})
    except Exception as e:
        current_app.logger.exception("session start failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/session/end', methods=['POST'])
def end_session():
    data = request.get_json(force=True) or {}
    token = data.get('session_token')
    duration = data.get('duration_seconds')  # optional
    ended_at = now_iso()
    if not token:
        return jsonify({'error': 'session_token required'}), 400
    try:
        conn = get_db_conn()
        cur = conn.cursor()
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
        conn.commit()
        conn.close()
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
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO search_logs (user_id, query, results_count, clicked_term, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, query, results_count, clicked_term, now_iso()))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("search log failed")
        return jsonify({'error': str(e)}), 500

# ------------------------------------------------------------------
# NEW/MODIFIED COLLECTION ENDPOINTS (REPLACES OLD JSON FIELD LOGIC)
# ------------------------------------------------------------------

@activity_bp.route('/api/collections', methods=['GET'])
def get_collections():
    """Fetches all user collections and their terms from the new many-to-many tables."""
    user_id = request.args.get('user_id', 'local')
    conn = get_db_conn()
    cursor = conn.cursor()
    
    # 1. Get all collections for the user
    cursor.execute("SELECT id, name FROM user_collections WHERE user_id = ?", (user_id,))
    collections_data = cursor.fetchall()
    
    collections = []
    for coll in collections_data:
        # 2. Get terms for each collection
        cursor.execute("SELECT term FROM collection_terms WHERE collection_id = ?", (coll['id'],))
        terms = [row['term'] for row in cursor.fetchall()]
        
        collections.append({
            'id': coll['id'],
            'name': coll['name'],
            'terms': terms 
        })
        
    conn.close()
    return jsonify(collections)

@activity_bp.route('/api/collections', methods=['POST'])
def save_collection():
    """Saves a new collection or updates an existing one using the user_collections and collection_terms tables."""
    data = request.get_json(force=True)
    user_id = _json_field(data, 'user_id', 'local')
    name = _json_field(data, 'name') # New required field for the collection name
    terms = _json_field(data, 'terms', []) # List of terms in the collection
    collection_id = _json_field(data, 'id') # Optional: for updating existing

    if not name:
        return jsonify({'error': 'Collection name is required'}), 400

    conn = get_db_conn()
    cursor = conn.cursor()

    try:
        if collection_id:
            # Update existing collection: update the name in the user_collections table
            cursor.execute("UPDATE user_collections SET name = ? WHERE id = ? AND user_id = ?", (name, collection_id, user_id))
            # Delete old terms to replace them with the new list (transactional replacement)
            cursor.execute("DELETE FROM collection_terms WHERE collection_id = ?", (collection_id,))
            id_to_use = collection_id
        else:
            # Insert new collection and get its ID
            cursor.execute("INSERT INTO user_collections (user_id, name) VALUES (?, ?)", (user_id, name))
            id_to_use = cursor.lastrowid
        
        # Insert all terms into the collection_terms linking table
        for term in terms:
            cursor.execute("INSERT INTO collection_terms (collection_id, term) VALUES (?, ?)", (id_to_use, term))

        conn.commit()
        conn.close()
        return jsonify({'message': 'Collection saved successfully', 'id': id_to_use}), 200
    except Exception as e:
        conn.rollback()
        conn.close()
        current_app.logger.exception("save_collection failed")
        return jsonify({'error': str(e)}), 500

@activity_bp.route('/api/collections/<int:cid>', methods=['DELETE'])
def delete_collection(cid):
    """Deletes a collection. Terms are automatically deleted from collection_terms via ON DELETE CASCADE."""
    user_id = request.args.get('user_id', 'local')
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        # Deleting from user_collections is enough due to the FOREIGN KEY ON DELETE CASCADE constraint
        cur.execute("DELETE FROM user_collections WHERE id = ? AND user_id = ?", (cid, user_id))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        current_app.logger.exception("delete_collection failed")
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
        conn = get_db_conn()
        cur = conn.cursor()
        # total terms (fast)
        # Note: assuming 'terms_data' table exists in your DB, as per context
        cur.execute("SELECT COUNT(*) as cnt FROM terms_data")
        total = cur.fetchone()['cnt'] if cur.rowcount else 0

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

        conn.close()
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
        conn = get_db_conn()
        cur = conn.cursor()
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
        conn.close()
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
        conn = get_db_conn()
        cur = conn.cursor()
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
        conn.close()
        return jsonify(data)
    except Exception as e:
        current_app.logger.exception("term_group failed")
        return jsonify({'error': str(e)}), 500