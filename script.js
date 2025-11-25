// Global state
let allTerms = [];
let currentView = 'discover';
let currentTerm = null;
let sessionTerms = 0;
let allSubjects = [];
let userCollections = JSON.parse(localStorage.getItem('userCollections') || '[]');
let tickerStopped = localStorage.getItem('tickerStopped') === 'true';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadTerms();
    setupEventListeners()
    loadHomework();
    updateStats();
    loadCollections();
    initializeTicker();
    startClock();
});

// Start clock with online/offline support
function startClock() {
    // First, show system time immediately
    updateSystemClock();

    // Try to get online time
    fetchOnlineTime();

    // Update every second
    setInterval(() => {
        if (window.timeOffset !== undefined) {
            updateClockWithOffset(window.timeOffset);
        } else {
            updateSystemClock();
        }
    }, 1000);
}

// Fetch time from online server
async function fetchOnlineTime() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata', {
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
            const data = await response.json();
            const serverTime = new Date(data.datetime);
            window.timeOffset = serverTime.getTime() - Date.now();
            console.log('✓ Using online time (Asia/Kolkata)');
        }
    } catch (error) {
        console.log('⚠ Using system time (offline)');
        window.timeOffset = undefined;
    }
}

// Update clock with offset
function updateClockWithOffset(offset) {
    const now = new Date(Date.now() + offset);
    displayClock(now);
}

// Update system clock
function updateSystemClock() {
    displayClock(new Date());
}

// Display clock in Indian format
function displayClock(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12;
    hours = hours.toString().padStart(2, '0');

    const dayName = days[date.getDay()];
    const timeString = `${hours}:${minutes}:${seconds} ${ampm} ${dayName}`;

    const clockElement = document.getElementById('liveClock');
    if (clockElement) {
        clockElement.textContent = timeString;
    }
}

// Initialize copyright ticker
function initializeTicker() {
    const ticker = document.getElementById('copyrightTicker');
    if (!ticker) return;

    if (tickerStopped) {
        ticker.classList.add('stopped');
    } else {
        // Start immediately unless user had previously stopped the ticker
        ticker.classList.add('running');
        ticker.classList.remove('stopped');
    }

    ticker.addEventListener('click', () => {
        ticker.classList.toggle('stopped');
        tickerStopped = ticker.classList.contains('stopped');
        localStorage.setItem('tickerStopped', tickerStopped);
    });
}


// Load all terms
async function loadTerms() {
    showLoading();
    try {
        const response = await fetch('/api/terms');
        allTerms = await response.json();

        const subjectsResponse = await fetch('/api/subjects');
        allSubjects = await subjectsResponse.json();

        document.getElementById('totalTermsCount').textContent = allTerms.length;
        renderDiscoverView();
        renderSubjectsPreview();
        updateQuickAccessCounts();
        hideLoading();
    } catch (error) {
        console.error('Error loading terms:', error);
        hideLoading();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            switchView(view);
        });
    });

    // Quick access buttons
    document.getElementById('quickFavorites')?.addEventListener('click', () => showFilteredTerms('favorites', 'Favorite Terms'));
    document.getElementById('quickBookmarks')?.addEventListener('click', () => showFilteredTerms('bookmarks', 'Bookmarked Terms'));
    document.getElementById('quickNotes')?.addEventListener('click', () => showFilteredTerms('notes', 'Terms with Notes'));
    document.getElementById('quickEasy')?.addEventListener('click', () => showFilteredTerms('difficulty', 'Easy Terms', 'easy'));
    document.getElementById('quickMedium')?.addEventListener('click', () => showFilteredTerms('difficulty', 'Medium Terms', 'medium'));
    document.getElementById('quickHard')?.addEventListener('click', () => showFilteredTerms('difficulty', 'Hard Terms', 'hard'));

    // Theme toggle
    document.getElementById('themeBtn').addEventListener('click', toggleTheme);

    // Font controls
    document.getElementById('fontSelect').addEventListener('change', changeFont);
    document.getElementById('fontIncrease').addEventListener('click', () => changeFontSize(1));
    document.getElementById('fontDecrease').addEventListener('click', () => changeFontSize(-1));

    // Search with instant results
    document.getElementById('searchInput').addEventListener('input', handleSearchInstant);

    // Print
    document.getElementById('printBtn').addEventListener('click', () => window.print());

    // Exit
    document.getElementById('exitBtn').addEventListener('click', exitApp);

    // Homework
    document.getElementById('addHomeworkBtn').addEventListener('click', () => {
        document.getElementById('homeworkModal').classList.add('active');
    });
    document.getElementById('closeModal').addEventListener('click', () => {
        document.getElementById('homeworkModal').classList.remove('active');
    });
    document.getElementById('saveHomework').addEventListener('click', saveHomework);
    document.getElementById('cancelHomework').addEventListener('click', () => {
        document.getElementById('homeworkModal').classList.remove('active');
    });
    document.getElementById('hwTermInput').addEventListener('input', handleHwSearch);
}

// Update quick access counts
async function updateQuickAccessCounts() {
    try {
        const response = await fetch('/api/stats/overview');
        const stats = await response.json();

        document.getElementById('favCount').textContent = stats.favorites;
        document.getElementById('bookCount').textContent = stats.bookmarks;

        const metaResponse = await fetch('/api/meta/counts');
        const meta = await metaResponse.json();

        document.getElementById('notesCount').textContent = meta.with_notes;
        document.getElementById('easyCount').textContent = meta.easy;
        document.getElementById('mediumCount').textContent = meta.medium;
        document.getElementById('hardCount').textContent = meta.hard;
    } catch (error) {
        console.error('Error updating counts:', error);
    }
}

// Switch view
function switchView(view) {
    currentView = view;

    // Update nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });

    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    if (view === 'discover') {
        document.getElementById('discoverView').classList.add('active');
        renderDiscoverView();
    } else if (view === 'features') {
        document.getElementById('featuresView').classList.add('active');
    } else if (view === 'search') {
        document.getElementById('searchView').classList.add('active');
        document.getElementById('searchInput').focus();
    } else if (view === 'subjects') {
        document.getElementById('subjectsView').classList.add('active');
        renderSubjectsView();
    } else if (view === 'alphabet') {
        document.getElementById('alphabetView').classList.add('active');
        renderAlphabetView();
    } else if (view === 'stats') {
        document.getElementById('statsView').classList.add('active');
        renderStatsView();
    } else if (view === 'homework') {
        document.getElementById('homeworkView').classList.add('active');
        loadHomework();
    } else if (view === 'collections') {
        document.getElementById('collectionsView').classList.add('active');
        renderCollectionsView();
    }
}

// Render discover view
function renderDiscoverView() {
    const container = document.getElementById('randomTerms');
    const randomTerms = getRandomTerms(6);

    container.innerHTML = randomTerms.map(term => `
        <div class="term-card" onclick="viewTerm('${escapeHtml(term.term)}')">
            <h3 class="term-card-title">${escapeHtml(term.term)}</h3>
            <span class="term-card-subject">${escapeHtml(term.subject)}</span>
        </div>
    `).join('');

    // Update home stats
    updateHomeStats();
}

// Update home page statistics
async function updateHomeStats() {
    try {
        const response = await fetch('/api/stats/overview');
        const stats = await response.json();

        document.getElementById('homeStatTerms').textContent = stats.total_terms.toLocaleString();
        document.getElementById('homeStatSubjects').textContent = allSubjects.length;
        document.getElementById('homeStatFavorites').textContent = stats.favorites;
        document.getElementById('homeStatCollections').textContent = userCollections.length;
    } catch (error) {
        console.error('Error updating home stats:', error);
    }
}

// Render subjects preview with elegant tiles
function renderSubjectsPreview() {
    const container = document.getElementById('subjectsPreview');
    container.innerHTML = allSubjects.map(s => `
        <div class="subject-tile" onclick="filterBySubject('${escapeHtml(s.subject)}')">
            <div class="subject-tile-name">${escapeHtml(s.subject)}</div>
            <div class="subject-tile-count">${s.count} terms</div>
        </div>
    `).join('');
}

// Filter by subject
async function filterBySubject(subject) {
    showLoading();
    try {
        const response = await fetch(`/api/terms/subject/${encodeURIComponent(subject)}`);
        const terms = await response.json();

        switchView('subjects');

        const container = document.getElementById('subjectsList');
        container.innerHTML = `
            <div class="view-header">
                <h2>${escapeHtml(subject)}</h2>
                <p>${terms.length} terms</p>
            </div>
            <div class="term-grid">
                ${terms.map(term => `
                    <div class="term-card" onclick="viewTerm('${escapeHtml(term.term)}')">
                        <h3 class="term-card-title">${escapeHtml(term.term)}</h3>
                        <span class="term-card-subject">${escapeHtml(term.subject)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        hideLoading();
    } catch (error) {
        console.error('Error filtering by subject:', error);
        hideLoading();
    }
}

// Render subjects view with elegant tiles
function renderSubjectsView() {
    const container = document.getElementById('subjectsList');

    container.innerHTML = `
        <div class="subjects-grid">
            ${allSubjects.map(s => `
                <div class="subject-tile-large" onclick="filterBySubject('${escapeHtml(s.subject)}')">
                    <div class="subject-icon">📚</div>
                    <div class="subject-tile-name">${escapeHtml(s.subject)}</div>
                    <div class="subject-tile-count">${s.count} terms</div>
                </div>
            `).join('')}
        </div>
    `;
}

// Render alphabet view
function renderAlphabetView() {
    const navContainer = document.getElementById('alphabetNav');
    const termsContainer = document.getElementById('alphabetTerms');

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    navContainer.innerHTML = letters.map(letter =>
        `<button class="alphabet-btn" onclick="filterByLetter('${letter}')">${letter}</button>`
    ).join('');

    displayAlphabetTerms(allTerms);
}

function filterByLetter(letter) {
    document.querySelectorAll('.alphabet-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent === letter) {
            btn.classList.add('active');
        }
    });

    const filtered = allTerms.filter(t => t.term.toUpperCase().startsWith(letter));
    displayAlphabetTerms(filtered);
}

function displayAlphabetTerms(terms) {
    const container = document.getElementById('alphabetTerms');

    if (terms.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No terms found</p>';
        return;
    }

    container.innerHTML = `
        <div class="term-grid">
            ${terms.map(term => `
                <div class="term-card" onclick="viewTerm('${escapeHtml(term.term)}')">
                    <h3 class="term-card-title">${escapeHtml(term.term)}</h3>
                    <span class="term-card-subject">${escapeHtml(term.subject)}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Instant search with priority sorting (debounced for smooth performance)
let searchTimeout;
async function handleSearchInstant(e) {
    const query = e.target.value.toLowerCase().trim();
    const container = document.getElementById('searchResults');

    if (query.length < 2) {
        container.innerHTML = '';
        return;
    }

    // Clear previous timeout
    if (searchTimeout) clearTimeout(searchTimeout);

    // Debounce for smooth typing
    searchTimeout = setTimeout(async () => {
        try {
            // Get all matching terms
            let results = allTerms.filter(t =>
                t.term.toLowerCase().includes(query) ||
                t.subject.toLowerCase().includes(query)
            );

            // Get metadata for priority sorting
            const metaResponse = await fetch('/api/meta/all');
            const allMeta = await metaResponse.json();

            // Sort by priority
            results.sort((a, b) => {
                const aMeta = allMeta.find(m => m.term === a.term);
                const bMeta = allMeta.find(m => m.term === b.term);

                const aPriority = (aMeta?.favorite ? 10 : 0) +
                    (aMeta?.bookmark ? 5 : 0) +
                    (aMeta?.notes ? 3 : 0) +
                    (aMeta?.difficulty !== 'unknown' ? 2 : 0) +
                    (aMeta?.rating ? 1 : 0);

                const bPriority = (bMeta?.favorite ? 10 : 0) +
                    (bMeta?.bookmark ? 5 : 0) +
                    (bMeta?.notes ? 3 : 0) +
                    (bMeta?.difficulty !== 'unknown' ? 2 : 0) +
                    (bMeta?.rating ? 1 : 0);

                return bPriority - aPriority;
            });

            displaySearchResults(results, allMeta);
        } catch (error) {
            console.error('Error in search:', error);
            // Fallback to basic search
            const results = allTerms.filter(t =>
                t.term.toLowerCase().includes(query) ||
                t.subject.toLowerCase().includes(query)
            );
            displaySearchResults(results, []);
        }
    }, 300); // 300ms debounce - smooth typing experience
}

function displaySearchResults(results, metadata = []) {
    const container = document.getElementById('searchResults');

    if (results.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No results found</p>';
        return;
    }

    // Simple dropdown list for better performance
    container.innerHTML = `
        <div class="search-results-list">
            ${results.map(term => {
        const meta = metadata.find(m => m.term === term.term);
        const badges = [];
        let priorityLabel = '';

        if (meta?.favorite) {
            badges.push('★');
            priorityLabel = '<span class="priority-label priority-high">High Priority</span>';
        }
        else if (meta?.bookmark) {
            badges.push('🔖');
            priorityLabel = '<span class="priority-label priority-medium">Bookmarked</span>';
        }
        else if (meta?.notes) {
            badges.push('📝');
            priorityLabel = '<span class="priority-label priority-normal">Has Notes</span>';
        }
        else if (meta?.difficulty && meta.difficulty !== 'unknown') {
            priorityLabel = `<span class="priority-label priority-${meta.difficulty}">${meta.difficulty}</span>`;
        }

        return `
                <div class="search-result-item" onclick="viewTerm('${escapeHtml(term.term)}')">
                    <div class="result-main">
                        <span class="result-badges">${badges.join(' ')}</span>
                        <span class="result-term">${escapeHtml(term.term)}</span>
                        ${priorityLabel}
                    </div>
                    <span class="result-subject">${escapeHtml(term.subject)}</span>
                </div>
            `}).join('')}
        </div>
    `;
}

// View term detail with Indian timestamp
async function viewTerm(termName) {
    showLoading();
    sessionTerms++;
    window.sessionTerms = sessionTerms;   // << ADD THIS LINE
    document.getElementById('sessionTermsCount').textContent = sessionTerms;

    try {
        const response = await fetch(`/api/term/${encodeURIComponent(termName)}`);
        const data = await response.json();
        currentTerm = data;

        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('termView').classList.add('active');

        renderTermDetail(data);
        hideLoading();
    } catch (error) {
        console.error('Error loading term:', error);
        hideLoading();
    }
}

// Format Indian timestamp
function formatIndianTime(timestamp) {
    if (!timestamp) return 'Not set';

    const date = new Date(timestamp);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12;
    hours = hours.toString().padStart(2, '0');

    const day = days[date.getDay()];

    return `${hours}:${minutes}:${seconds} ${ampm} ${day}`;
}

// Render term detail (ORIGINAL QUIZ FORMAT PRESERVED)
function renderTermDetail(data) {
    const container = document.getElementById('termContent');
    const meta = data.meta || {};

    // Build tabs and content for questions
    const hasObjective = data.objective_qa && data.objective_qa.length > 0;
    const hasDescriptive = data.descriptive_qa && data.descriptive_qa.length > 0;
    const hasQuiz = data.quiz_data && data.quiz_data.length > 0;

    let tabsHTML = '';
    let contentHTML = '';

    if (hasObjective) {
        tabsHTML += '<button class="tab-btn active" onclick="switchTab(event, \'objective\')">❓ Objective Questions</button>';
        contentHTML += `
            <div class="tab-content active" id="objective-content">
                ${data.objective_qa.map((qa, i) => `
                    <div class="qa-item">
                        <div class="qa-question">Q${i + 1}. ${qa.question}</div>
                        <div style="margin-top: 8px; color: var(--text-secondary);"><strong>Answer:</strong> ${qa.answer}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (hasDescriptive) {
        tabsHTML += `<button class="tab-btn${!hasObjective ? ' active' : ''}" onclick="switchTab(event, 'descriptive')">📋 Descriptive Questions</button>`;
        contentHTML += `
            <div class="tab-content${!hasObjective ? ' active' : ''}" id="descriptive-content">
                ${data.descriptive_qa.map((qa, i) => `
                    <div class="qa-item">
                        <div class="qa-question">Q${i + 1}. ${qa.question}</div>
                        <div style="margin-top: 12px;">${qa.answer}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    if (hasQuiz) {
        tabsHTML += `<button class="tab-btn${!hasObjective && !hasDescriptive ? ' active' : ''}" onclick="switchTab(event, 'quiz')">🎯 Practice Test</button>`;
        contentHTML += `
            <div class="tab-content${!hasObjective && !hasDescriptive ? ' active' : ''}" id="quiz-content">
                ${data.quiz_data.map((q, i) => {
            const options = q.options || {};
            return `
                    <div class="quiz-item">
                        <div class="qa-question">Q${i + 1}. ${q.question_text || q.question || ''}</div>
                        <ul class="quiz-options">
                            ${Object.keys(options).sort().map(key => `<li>${key}. ${options[key]}</li>`).join('')}
                        </ul>
                        <button class="quiz-toggle-btn" onclick="toggleQuizAnswer(${i})">Show Answer</button>
                        <div class="quiz-answer hidden" id="quiz-answer-${i}">
                            <strong style="color: var(--success);">✓ Correct Answer: ${q.correct_answer_key || q.correct_answer || ''}</strong>
                            ${q.explanation ? `<p style="margin-top: 12px;">${q.explanation}</p>` : ''}
                        </div>
                    </div>
                `}).join('')}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="term-detail">
            <div class="term-header">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <h1 class="term-title">${escapeHtml(data.term)}</h1>
                        <div class="term-meta">
                            <span class="subject-badge">${escapeHtml(data.subject)}</span>
                            <span class="timestamp-badge">⏰ ${formatIndianTime(meta.last_viewed)}</span>
                        </div>
                    </div>
                    <button onclick="switchView('${currentView}')" class="secondary-btn">← Back</button>
                </div>
            </div>
            
            <!-- Term Action Bar -->
            <div class="term-actions">
                <button onclick="toggleFavorite()" class="action-btn ${meta.favorite ? 'active' : ''}" id="favoriteBtn">
                    <span class="action-icon">${meta.favorite ? '★' : '☆'}</span>
                    <span>Favorite</span>
                </button>
                <button onclick="toggleBookmark()" class="action-btn ${meta.bookmark ? 'active' : ''}" id="bookmarkBtn">
                    <span class="action-icon">🔖</span>
                    <span>${meta.bookmark ? 'Bookmarked' : 'Bookmark'}</span>
                </button>
                <div class="action-group">
                    <label>Difficulty:</label>
                    <select onchange="setDifficulty(this.value)" class="select-input compact" id="difficultySelect">
                        <option value="unknown" ${meta.difficulty === 'unknown' ? 'selected' : ''}>-</option>
                        <option value="easy" ${meta.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
                        <option value="medium" ${meta.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
                        <option value="hard" ${meta.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
                    </select>
                </div>
                <div class="action-group">
                    <label>Rating:</label>
                    <div class="rating-stars">
                        <button onclick="setRating(0)" class="star-btn clear-rating" title="Clear rating">✖</button>
                        ${[1, 2, 3, 4, 5].map(r => `
                            <button onclick="setRating(${r})" class="star-btn">
                                ${r <= (meta.rating || 0) ? '★' : '☆'}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <button onclick="toggleNotes()" class="action-btn">
                    <span class="action-icon">📝</span>
                    <span>Notes</span>
                </button>
                <button onclick="showAddToCollectionModal()" class="action-btn">
                    <span class="action-icon">📁</span>
                    <span>Add to List</span>
                </button>
                <button onclick="showHistoryModal()" class="action-btn">
                    <span class="action-icon">📜</span>
                    <span>History</span>
                </button>
            </div>
            
            <!-- Notes Section -->
            <div id="notesSection" class="notes-section" style="display: none;">
                <textarea id="termNotes" class="notes-textarea" placeholder="Add your personal notes...">${escapeHtml(meta.notes || '')}</textarea>
                <button onclick="saveNotes()" class="primary-btn">Save Notes</button>
            </div>
            
            ${getExternalResourceHtml(data.term)} ${data.definition ? `
                <div class="section">
                    <h2 class="section-title">📖 Definition</h2>
                    <p>${data.definition}</p>
                </div>
            ` : ''}
            
            ${data.keyPoints && data.keyPoints.length > 0 ? `
                <div class="section">
                    <h2 class="section-title">🔑 Key Points</h2>
                    <ul>
                        ${data.keyPoints.map(kp => `<li>${kp}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            ${data.example ? `
                <div class="section">
                    <h2 class="section-title">💡 Example</h2>
                    <p>${data.example}</p>
                </div>
            ` : ''}
            
            ${(hasObjective || hasDescriptive || hasQuiz) ? `
                <div class="section">
                    <div class="tabs-container">
                        ${tabsHTML}
                    </div>
                    ${contentHTML}
                </div>
            ` : ''}
        </div>
    `;
}

// Tab switching
function switchTab(event, tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabName + '-content').classList.add('active');
}

// Toggle quiz answer
function toggleQuizAnswer(index) {
    const answer = document.getElementById(`quiz-answer-${index}`);
    answer.classList.toggle('hidden');
    const btn = answer.previousElementSibling;
    btn.textContent = answer.classList.contains('hidden') ? 'Show Answer' : 'Hide Answer';
}

// Term metadata functions
async function toggleFavorite() {
    if (!currentTerm) return;
    const newValue = currentTerm.meta.favorite === 1 ? 0 : 1;
    await saveTermMeta({ favorite: newValue });
    currentTerm.meta.favorite = newValue;
    const btn = document.getElementById('favoriteBtn');
    btn.querySelector('.action-icon').textContent = newValue ? '★' : '☆';
    btn.classList.toggle('active', newValue === 1);
    updateQuickAccessCounts();
}

async function toggleBookmark() {
    if (!currentTerm) return;
    const newValue = currentTerm.meta.bookmark === 1 ? 0 : 1;
    await saveTermMeta({ bookmark: newValue });
    currentTerm.meta.bookmark = newValue;
    const btn = document.getElementById('bookmarkBtn');
    btn.querySelector('span:last-child').textContent = newValue ? 'Bookmarked' : 'Bookmark';
    btn.classList.toggle('active', newValue === 1);
    updateQuickAccessCounts();
}

async function setDifficulty(difficulty) {
    if (!currentTerm) return;
    await saveTermMeta({ difficulty });
    currentTerm.meta.difficulty = difficulty;
    updateQuickAccessCounts();
}

async function setRating(rating) {
    if (!currentTerm) return;
    await saveTermMeta({ rating });
    currentTerm.meta.rating = rating;
    renderTermDetail(currentTerm);
}

function toggleNotes() {
    const section = document.getElementById('notesSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

// REPLACE the existing saveNotes() with this improved version
async function saveNotes() {
    if (!currentTerm) return;

    // Grab and normalize notes text
    const notesEl = document.getElementById('termNotes');
    const raw = notesEl ? String(notesEl.value || '').trim() : '';
    // count words: split on whitespace and filter out empty tokens
    const words = raw.length ? raw.split(/\s+/).filter(Boolean) : [];

    // If fewer than 3 words, treat as 'no meaningful notes' - do not save text
    if (words.length < 3) {
        // If there was previously content and user cleared it, save empty to clear remote notes
        const hadBefore = Boolean(currentTerm?.meta?.notes && String(currentTerm.meta.notes).trim().length > 0);
        if (hadBefore) {
            try {
                await saveTermMeta({ notes: '' });
                currentTerm.meta.notes = '';
            } catch (err) {
                console.error('Failed to clear notes:', err);
            }
        }
        // close notes panel and notify user that nothing was saved
        const notesSection = document.getElementById('notesSection');
        if (notesSection) notesSection.style.display = 'none';
        try {
            if (typeof showNotification === 'function') {
                showNotification('Notes too short — enter at least 3 words to save.');
            } else {
                alert('Notes too short — enter at least 3 words to save.');
            }
        } catch (e) {
            console.log('Notes too short — enter at least 3 words to save.');
        }
        updateQuickAccessCounts();
        return;
    }

    // Proceed to save (existing API)
    try {
        await saveTermMeta({ notes: raw });
        currentTerm.meta.notes = raw;
        // show success
        try {
            if (typeof showNotification === 'function') {
                showNotification('Notes saved successfully!');
            } else {
                alert('Notes saved successfully!');
            }
        } catch (e) {
            console.log('Notes saved successfully!');
        }
        updateQuickAccessCounts();
        // auto-close notes panel after brief delay so user sees confirmation
        const notesSection = document.getElementById('notesSection');
        if (notesSection) {
            setTimeout(() => { notesSection.style.display = 'none'; }, 400);
        }
    } catch (err) {
        console.error('Error saving notes:', err);
        try {
            if (typeof showNotification === 'function') {
                showNotification('Failed to save notes. Check console.');
            } else {
                alert('Failed to save notes. Check console.');
            }
        } catch (e) { /* ignore */ }
    }
}

async function saveTermMeta(data) {
    try {
        await fetch('/api/term/meta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                term: currentTerm.term,
                ...data
            })
        });

        // Track in history
        trackHistory(data);
    } catch (error) {
        console.error('Error saving metadata:', error);
    }
}

// History tracking
function trackHistory(action) {
    const history = JSON.parse(localStorage.getItem('termHistory') || '[]');

    const entry = {
        term: currentTerm.term,
        subject: currentTerm.subject,
        action: getActionDescription(action),
        timestamp: new Date().toISOString(),
        details: action
    };

    history.unshift(entry); // Add to beginning

    // Keep last 500 entries
    if (history.length > 500) {
        history.length = 500;
    }

    localStorage.setItem('termHistory', JSON.stringify(history));
}

function getActionDescription(action) {
    if (action.favorite !== undefined) return action.favorite ? 'Marked as Favorite' : 'Removed from Favorites';
    if (action.bookmark !== undefined) return action.bookmark ? 'Bookmarked' : 'Removed Bookmark';
    if (action.difficulty) return `Set difficulty to ${action.difficulty}`;
    if (action.rating !== undefined) return action.rating === 0 ? 'Cleared rating' : `Rated ${action.rating} stars`;
    if (action.notes !== undefined) return action.notes ? 'Added/Updated notes' : 'Cleared notes';
    return 'Updated';
}

// Show history modal
function showHistoryModal() {
    const history = JSON.parse(localStorage.getItem('termHistory') || '[]');

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'historyModal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>Activity History</h3>
                <button class="close-btn" onclick="closeHistoryModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="history-filters">
                    <button onclick="filterHistory('hour')" class="filter-btn">Last Hour</button>
                    <button onclick="filterHistory('day')" class="filter-btn">Today</button>
                    <button onclick="filterHistory('week')" class="filter-btn">This Week</button>
                    <button onclick="filterHistory('month')" class="filter-btn">This Month</button>
                    <button onclick="filterHistory('all')" class="filter-btn active">All Time</button>
                    <button onclick="clearHistory('all')" class="danger-btn">Clear All</button>
                </div>
                <div id="historyList" class="history-list">
                    ${renderHistoryList(history)}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function renderHistoryList(entries) {
    if (entries.length === 0) {
        return '<p class="empty-state">No history yet</p>';
    }

    return entries.map((entry, idx) => `
        <div class="history-item">
            <div class="history-main">
                <span class="history-term" onclick="closeHistoryModal(); viewTerm('${escapeHtml(entry.term)}')">${escapeHtml(entry.term)}</span>
                <span class="history-action">${entry.action}</span>
            </div>
            <div class="history-meta">
                <span class="history-subject">${escapeHtml(entry.subject)}</span>
                <span class="history-time">${formatIndianTime(entry.timestamp)}</span>
            </div>
        </div>
    `).join('');
}

function filterHistory(period) {
    const history = JSON.parse(localStorage.getItem('termHistory') || '[]');
    const now = new Date();
    let filtered = history;

    if (period === 'hour') {
        const hourAgo = new Date(now - 60 * 60 * 1000);
        filtered = history.filter(h => new Date(h.timestamp) > hourAgo);
    } else if (period === 'day') {
        const dayStart = new Date(now.setHours(0, 0, 0, 0));
        filtered = history.filter(h => new Date(h.timestamp) > dayStart);
    } else if (period === 'week') {
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        filtered = history.filter(h => new Date(h.timestamp) > weekAgo);
    } else if (period === 'month') {
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        filtered = history.filter(h => new Date(h.timestamp) > monthAgo);
    }

    document.getElementById('historyList').innerHTML = renderHistoryList(filtered);

    // Update active button
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function clearHistory(period) {
    if (!confirm(`Clear ${period === 'all' ? 'all' : period} history?`)) return;

    if (period === 'all') {
        localStorage.setItem('termHistory', '[]');
        showNotification('All history cleared');
        closeHistoryModal();
    }
}

function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.remove();
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Collections Management - Enhanced GUI
function showAddToCollectionModal() {
    if (!currentTerm) return;

    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'collectionModal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>Add "${escapeHtml(currentTerm.term)}" to Collection</h3>
                <button class="close-btn" onclick="closeCollectionModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="collection-creator">
                    <h4>Create New List</h4>
                    <div class="level-inputs">
                        <input type="text" class="level-input" placeholder="Level 1 (e.g., Class 10)" id="level1">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" placeholder="Level 2 (e.g., Biology)" id="level2">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" placeholder="Level 3 (e.g., Genetics)" id="level3">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" placeholder="Level 4 (Optional)" id="level4">
                    </div>
                    <button onclick="createCollectionFromLevels()" class="primary-btn">Create This List</button>
                </div>
                
                <div class="divider">OR</div>
                
                <div class="existing-collections">
                    <h4>Add to Existing List</h4>
                    ${userCollections.length === 0 ? '<p class="empty-state">No lists created yet</p>' : ''}
                    <div class="collections-list">
                        ${userCollections.map((col, i) => `
                            <div class="collection-item" onclick="addTermToCollection(${i})">
                                <div class="collection-path">${escapeHtml(col.name)}</div>
                                <div class="collection-count">${col.terms.length} terms</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function createCollectionFromLevels() {
    const level1 = document.getElementById('level1').value.trim();
    const level2 = document.getElementById('level2').value.trim();
    const level3 = document.getElementById('level3').value.trim();
    const level4 = document.getElementById('level4').value.trim();

    if (!level1) {
        showNotification('Please enter at least Level 1');
        return;
    }

    const levels = [level1, level2, level3, level4].filter(l => l);
    const name = levels.join(' > ');

    const collection = {
        id: Date.now(),
        name: name,
        levels: levels,
        terms: currentTerm ? [currentTerm.term] : [],
        created: new Date().toISOString()
    };

    userCollections.push(collection);
    localStorage.setItem('userCollections', JSON.stringify(userCollections));
    closeCollectionModal();
    showNotification(`Created and added to "${name}"`);
}

function addTermToCollection(collectionIndex) {
    if (!currentTerm) return;

    const collection = userCollections[collectionIndex];
    if (!collection.terms.includes(currentTerm.term)) {
        collection.terms.push(currentTerm.term);
        localStorage.setItem('userCollections', JSON.stringify(userCollections));
        showNotification(`Added to "${collection.name}"`);
    } else {
        showNotification('Already in this list');
    }
    closeCollectionModal();
}

function closeCollectionModal() {
    const modal = document.getElementById('collectionModal');
    if (modal) modal.remove();
}

function loadCollections() {
    userCollections = JSON.parse(localStorage.getItem('userCollections') || '[]');
}

// Render Collections View with elegant UI
function renderCollectionsView() {
    const container = document.getElementById('collectionsView');
    if (!container) return;

    container.innerHTML = `
        <div class="view-header">
            <h2>My Collections</h2>
            <button onclick="showCreateCollectionModal()" class="primary-btn">+ Create New List</button>
        </div>
        
        ${userCollections.length === 0 ? `
            <div class="empty-state-large">
                <div class="empty-icon">📁</div>
                <h3>No Collections Yet</h3>
                <p>Create your first list to organize terms</p>
                <button onclick="showCreateCollectionModal()" class="primary-btn">Create Your First List</button>
            </div>
        ` : `
            <div class="collections-grid">
                ${userCollections.map((col, i) => `
                    <div class="collection-card">
                        <div class="collection-header">
                            <div class="collection-name">${escapeHtml(col.name)}</div>
                            <div class="collection-actions">
                                <button onclick="editCollection(${i})" class="icon-btn" title="Edit">✏️</button>
                                <button onclick="deleteCollection(${i})" class="icon-btn" title="Delete">🗑️</button>
                            </div>
                        </div>
                        ${col.levels ? `
                            <div class="collection-hierarchy">
                                ${col.levels.map((level, idx) => `
                                    <span class="hierarchy-level">${escapeHtml(level)}</span>
                                    ${idx < col.levels.length - 1 ? '<span class="hierarchy-arrow">→</span>' : ''}
                                `).join('')}
                            </div>
                        ` : ''}
                        <div class="collection-footer">
                            <span class="collection-count">${col.terms.length} terms</span>
                            <button onclick="viewCollection(${i})" class="primary-btn compact">View Terms</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
    `;
}

function showCreateCollectionModal() {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'createCollectionModal';
    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>Create New Collection</h3>
                <button class="close-btn" onclick="document.getElementById('createCollectionModal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="collection-creator">
                    <p class="helper-text">Create up to 4 levels of hierarchy for your collection</p>
                    <div class="level-inputs">
                        <input type="text" class="level-input" placeholder="Level 1 (Required)" id="newLevel1">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" placeholder="Level 2 (Optional)" id="newLevel2">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" placeholder="Level 3 (Optional)" id="newLevel3">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" placeholder="Level 4 (Optional)" id="newLevel4">
                    </div>
                    <div class="example-text">
                        Example: Class 10 → Biology → Genetics → DNA Structure
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="createNewCollection()" class="primary-btn">Create Collection</button>
                <button onclick="document.getElementById('createCollectionModal').remove()" class="secondary-btn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function createNewCollection() {
    const level1 = document.getElementById('newLevel1').value.trim();
    const level2 = document.getElementById('newLevel2').value.trim();
    const level3 = document.getElementById('newLevel3').value.trim();
    const level4 = document.getElementById('newLevel4').value.trim();

    if (!level1) {
        showNotification('Please enter at least Level 1');
        return;
    }

    const levels = [level1, level2, level3, level4].filter(l => l);
    const name = levels.join(' > ');

    const collection = {
        id: Date.now(),
        name: name,
        levels: levels,
        terms: [],
        created: new Date().toISOString()
    };

    userCollections.push(collection);
    localStorage.setItem('userCollections', JSON.stringify(userCollections));
    document.getElementById('createCollectionModal').remove();
    showNotification(`Collection "${name}" created!`);
    renderCollectionsView();
}

function editCollection(index) {
    const collection = userCollections[index];
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'editCollectionModal';

    const levels = collection.levels || collection.name.split(' > ');

    modal.innerHTML = `
        <div class="modal-content large">
            <div class="modal-header">
                <h3>Edit Collection</h3>
                <button class="close-btn" onclick="document.getElementById('editCollectionModal').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="collection-creator">
                    <div class="level-inputs">
                        <input type="text" class="level-input" value="${escapeHtml(levels[0] || '')}" id="editLevel1">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" value="${escapeHtml(levels[1] || '')}" id="editLevel2">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" value="${escapeHtml(levels[2] || '')}" id="editLevel3">
                        <span class="level-arrow">→</span>
                        <input type="text" class="level-input" value="${escapeHtml(levels[3] || '')}" id="editLevel4">
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button onclick="saveCollectionEdit(${index})" class="primary-btn">Save Changes</button>
                <button onclick="document.getElementById('editCollectionModal').remove()" class="secondary-btn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function saveCollectionEdit(index) {
    const level1 = document.getElementById('editLevel1').value.trim();
    const level2 = document.getElementById('editLevel2').value.trim();
    const level3 = document.getElementById('editLevel3').value.trim();
    const level4 = document.getElementById('editLevel4').value.trim();

    if (!level1) {
        showNotification('Level 1 cannot be empty');
        return;
    }

    const levels = [level1, level2, level3, level4].filter(l => l);
    const name = levels.join(' > ');

    userCollections[index].name = name;
    userCollections[index].levels = levels;
    localStorage.setItem('userCollections', JSON.stringify(userCollections));

    document.getElementById('editCollectionModal').remove();
    showNotification('Collection updated!');
    renderCollectionsView();
}

function viewCollection(index) {
    const collection = userCollections[index];
    showLoading();

    const termsToShow = allTerms.filter(t => collection.terms.includes(t.term));

    const container = document.getElementById('collectionsView');
    container.innerHTML = `
        <div class="view-header">
            <button onclick="renderCollectionsView()" class="secondary-btn">← Back to Collections</button>
            <h2>${escapeHtml(collection.name)}</h2>
            <p>${termsToShow.length} terms</p>
        </div>
        
        ${collection.levels ? `
            <div class="breadcrumb">
                ${collection.levels.map(level => `<span class="breadcrumb-item">${escapeHtml(level)}</span>`).join('<span class="breadcrumb-arrow">→</span>')}
            </div>
        ` : ''}
        
        ${termsToShow.length === 0 ? `
            <div class="empty-state">
                <p>No terms in this collection yet</p>
                <button onclick="switchView('discover')" class="primary-btn">Browse Terms</button>
            </div>
        ` : `
            <div class="term-grid">
                ${termsToShow.map(term => `
                    <div class="term-card">
                        <h3 class="term-card-title" onclick="viewTerm('${escapeHtml(term.term)}')">${escapeHtml(term.term)}</h3>
                        <span class="term-card-subject">${escapeHtml(term.subject)}</span>
                        <button onclick="event.stopPropagation(); removeFromCollection(${index}, '${escapeHtml(term.term)}')" 
                                class="remove-btn">Remove</button>
                    </div>
                `).join('')}
            </div>
        `}
    `;
    hideLoading();
}

function removeFromCollection(collectionIndex, termName) {
    const collection = userCollections[collectionIndex];
    collection.terms = collection.terms.filter(t => t !== termName);
    localStorage.setItem('userCollections', JSON.stringify(userCollections));
    viewCollection(collectionIndex);
    showNotification('Term removed from collection');
}

function deleteCollection(index) {
    if (confirm(`Delete "${userCollections[index].name}"?`)) {
        userCollections.splice(index, 1);
        localStorage.setItem('userCollections', JSON.stringify(userCollections));
        renderCollectionsView();
        showNotification('Collection deleted');
    }
}

// Show filtered terms
async function showFilteredTerms(filterType, title, param = null) {
    showLoading();
    try {
        let url = `/api/meta/filter/${filterType}`;
        if (param) url += `/${param}`;

        const response = await fetch(url);
        const terms = await response.json();

        switchView('collections');
        const container = document.getElementById('collectionsView');
        container.innerHTML = `
            <div class="view-header">
                <button onclick="renderCollectionsView()" class="secondary-btn">← Back</button>
                <h2>${title}</h2>
                <p>${terms.length} terms</p>
            </div>
            ${terms.length === 0 ? `
                <div class="empty-state">
                    <p>No terms match this filter</p>
                </div>
            ` : `
                <div class="term-grid">
                    ${terms.map(term => `
                        <div class="term-card" onclick="viewTerm('${escapeHtml(term.term)}')">
                            <h3 class="term-card-title">${escapeHtml(term.term)}</h3>
                            <span class="term-card-subject">${escapeHtml(term.subject || 'N/A')}</span>
                        </div>
                    `).join('')}
                </div>
            `}
        `;
        hideLoading();
    } catch (error) {
        console.error('Error loading filtered terms:', error);
        hideLoading();
    }
}

// Statistics view with clickable tiles
async function renderStatsView() {
    try {
        const response = await fetch('/api/stats/overview');
        const stats = await response.json();

        const container = document.getElementById('statsContent');
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-card-label">Total Terms</div>
                    <div class="stat-card-value">${stats.total_terms}</div>
                </div>
                <div class="stat-card clickable" onclick="showFilteredTerms('favorites', 'Favorite Terms')">
                    <div class="stat-card-label">Favorites</div>
                    <div class="stat-card-value">${stats.favorites}</div>
                </div>
                <div class="stat-card clickable" onclick="showFilteredTerms('bookmarks', 'Bookmarked Terms')">
                    <div class="stat-card-label">Bookmarks</div>
                    <div class="stat-card-value">${stats.bookmarks}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-label">Recent Views (7 days)</div>
                    <div class="stat-card-value">${stats.recent_views}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-label">My Collections</div>
                    <div class="stat-card-value">${userCollections.length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-card-label">Session Views</div>
                    <div class="stat-card-value">${sessionTerms}</div>
                </div>
            </div>
            
            <div style="margin-top: 40px;">
                <h3 style="margin-bottom: 20px;">Subject Distribution</h3>
                <div class="subjects-grid compact">
                    ${allSubjects.map(s => `
                        <div class="subject-tile-small clickable" onclick="filterBySubject('${escapeHtml(s.subject)}')">
                            <div class="subject-tile-name">${escapeHtml(s.subject)}</div>
                            <div class="subject-tile-count">${s.count} terms</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Homework functions
function loadHomework() {
    const homework = JSON.parse(localStorage.getItem('homework') || '[]');
    const container = document.getElementById('homeworkList');

    if (homework.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No homework added yet</p></div>';
        return;
    }

    container.innerHTML = homework.map((hw, i) => `
        <div class="homework-item">
            <div class="homework-header">
                <h3 class="homework-title">${escapeHtml(hw.term)}</h3>
                <span class="homework-date">${hw.date}</span>
            </div>
            ${hw.notes ? `<p class="homework-notes">${escapeHtml(hw.notes)}</p>` : ''}
            <div class="homework-actions">
                <button onclick="viewTerm('${escapeHtml(hw.term)}')" class="primary-btn compact">View Term</button>
                <button onclick="deleteHomework(${i})" class="secondary-btn compact">Delete</button>
            </div>
        </div>
    `).join('');
}

function handleHwSearch(e) {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) {
        document.getElementById('hwSuggestions').innerHTML = '';
        return;
    }

    const results = allTerms.filter(t => t.term.toLowerCase().includes(query)).slice(0, 5);

    document.getElementById('hwSuggestions').innerHTML = results.map(t => `
        <div class="suggestion-item" onclick="selectHwTerm('${escapeHtml(t.term)}')">
            <span class="suggestion-term">${escapeHtml(t.term)}</span>
            <span class="suggestion-subject">${escapeHtml(t.subject)}</span>
        </div>
    `).join('');
}

function selectHwTerm(term) {
    document.getElementById('hwTermInput').value = term;
    document.getElementById('hwSuggestions').innerHTML = '';
}

function saveHomework() {
    const term = document.getElementById('hwTermInput').value;
    const date = document.getElementById('hwDate').value;
    const notes = document.getElementById('hwNotes').value;

    if (!term || !date) {
        showNotification('Please enter term and date');
        return;
    }

    const homework = JSON.parse(localStorage.getItem('homework') || '[]');
    homework.push({ term, date, notes, added: new Date().toISOString() });
    localStorage.setItem('homework', JSON.stringify(homework));

    document.getElementById('homeworkModal').classList.remove('active');
    document.getElementById('hwTermInput').value = '';
    document.getElementById('hwDate').value = '';
    document.getElementById('hwNotes').value = '';

    loadHomework();
    showNotification('Homework added!');
}

function deleteHomework(index) {
    if (!confirm('Delete this homework?')) return;

    const homework = JSON.parse(localStorage.getItem('homework') || '[]');
    homework.splice(index, 1);
    localStorage.setItem('homework', JSON.stringify(homework));
    loadHomework();
    showNotification('Homework deleted');
}

// Utility functions
function getRandomTerms(count) {
    const shuffled = [...allTerms].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('active');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
}

function toggleTheme() {
    document.body.classList.toggle('dark');
    const icon = document.querySelector('.theme-icon');
    icon.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

function changeFont() {
    const font = document.getElementById('fontSelect').value;
    document.body.style.fontFamily = font;
    localStorage.setItem('font', font);
}

function changeFontSize(delta) {
    const currentSize = parseFloat(getComputedStyle(document.body).fontSize);
    const newSize = Math.max(12, Math.min(24, currentSize + delta));
    document.body.style.fontSize = newSize + 'px';
    localStorage.setItem('fontSize', newSize);
}

async function exitApp() {
    if (confirm('Are you sure you want to exit?')) {
        try {
            await fetch('/api/shutdown', { method: 'POST' });
        } catch (e) { }
        window.close();
    }
}

// Load saved preferences
window.addEventListener('load', () => {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark');
        document.querySelector('.theme-icon').textContent = '☀️';
    }

    const font = localStorage.getItem('font');
    if (font) {
        document.body.style.fontFamily = font;
        document.getElementById('fontSelect').value = font;
    }

    const fontSize = localStorage.getItem('fontSize');
    if (fontSize) {
        document.body.style.fontSize = fontSize + 'px';
    }
});
// ---- APPEND-ONLY: ensure clock starts even if DOMContentLoaded was missed ----
// Paste this at the very end of /mnt/data/script.js (append only; do not remove any existing lines)
(function ensureClockStartedAppendOnly() {
    try {
        // If startClock isn't defined yet, wait a short time and try again (without removing or changing existing code)
        function tryStart(attemptsLeft) {
            try {
                if (typeof startClock === 'function') {
                    // Prevent double-starting: use a flag on window
                    if (window.__prism_clock_started) return;
                    // Mark as started so subsequent calls don't create duplicate intervals
                    window.__prism_clock_started = true;

                    // Call startClock safely
                    try {
                        startClock();
                        // If startClock sets window.clockStart or similar, we're good.
                        // If it creates intervals, this prevents duplicates via the flag above.
                    } catch (err) {
                        console.warn('ensureClockStarted: startClock() threw:', err);
                        // allow further retries below
                        window.__prism_clock_started = false;
                        if (attemptsLeft > 0) setTimeout(() => tryStart(attemptsLeft - 1), 200);
                    }
                    return;
                }
            } catch (e) {
                console.error('ensureClockStarted: unexpected error', e);
            }
            // If startClock not available yet, retry a few times (non-destructive)
            if (attemptsLeft > 0) {
                setTimeout(() => tryStart(attemptsLeft - 1), 200);
            }
        }

        // Try up to 10 times (~2 seconds total) to find and call startClock.
        tryStart(10);

        // Also listen for load as a harmless fallback (won't remove or replace existing listeners)
        // If the app already uses window.addEventListener('load', ...) this just attaches an extra listener.
        window.addEventListener('load', function ensureClockOnLoadFallback() {
            try {
                if (typeof startClock === 'function' && !window.__prism_clock_started) {
                    window.__prism_clock_started = true;
                    startClock();
                }
            } catch (e) {
                console.warn('ensureClockOnLoadFallback failed:', e);
            }
        });

    } catch (outerErr) {
        console.error('ensureClockStartedAppendOnly failed:', outerErr);
    }
})();
// ---- APPEND-ONLY: Ticker control, stats auto-refresh, and features dev-cards injection ----
(function prismEnhancementsAppendOnly() {
    // Configuration
    const TICKER_DELAY_MS = 100; // "very late" start (8 seconds). Adjust if you want later.
    const STATS_POLL_INTERVAL_MS = 10000; // refresh counts every 10s
    const SUBJECTS_POLL_INTERVAL_MS = 20000; // refresh subject counts every 20s

    // --- Helper: safe fetch wrapper
    async function safeFetchJson(url, fallback = null) {
        try {
            const r = await fetch(url, { cache: 'no-cache' });
            if (!r.ok) throw new Error('network:' + r.status);
            return await r.json();
        } catch (e) {
            console.warn('safeFetchJson failed', url, e);
            return fallback;
        }
    }

    // --- TICKER controller (non-destructive)
    function ensureTickerControls() {
        const ticker = document.getElementById('copyrightTicker');
        if (!ticker) return;

        // create control button (small, unobtrusive) if not present
        if (!document.getElementById('tickerControlBtn')) {
            const btn = document.createElement('button');
            btn.id = 'tickerControlBtn';
            btn.title = 'Pause / Play Ticker';
            btn.setAttribute('aria-label', 'Pause or resume copyright ticker');
            btn.className = 'ticker-control-btn';
            // append to top-right of page
            ticker.style.position = 'fixed';
            ticker.appendChild(btn);

            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // don't fire the ticker click handler accidentally
                const stopped = ticker.classList.toggle('stopped');
                localStorage.setItem('tickerStopped', stopped ? 'true' : 'false');
                // if stopped, center; if resumed, ensure running class applied
                if (!stopped && ticker.classList.contains('running') === false) {
                    // small delay to let CSS reflow
                    setTimeout(() => ticker.classList.add('running'), 50);
                }
                updateTickerControlUI(btn, stopped);
            });

            // initial UI
            updateTickerControlUI(btn, ticker.classList.contains('stopped') || tickerStopped);
        }

        // Delayed start: remove animation until delay passes (uses CSS override in appended style)
        // We store "running" state in localStorage too so user preference persists.
        setTimeout(() => {
            const persistedStopped = localStorage.getItem('tickerStopped') === 'true';
            if (!persistedStopped) {
                ticker.classList.add('running'); // starts animation via CSS override
                ticker.classList.remove('stopped');
            } else {
                ticker.classList.remove('running');
                ticker.classList.add('stopped');
            }
        }, TICKER_DELAY_MS);

        // Also ensure a click on the ticker itself toggles stop / start (keeps current behavior)
        ticker.addEventListener('click', () => {
            // click-to-toggle should center on stopped state (existing CSS uses .stopped)
            const isStopped = ticker.classList.toggle('stopped');
            if (isStopped) {
                ticker.classList.remove('running');
            } else {
                ticker.classList.add('running');
            }
            localStorage.setItem('tickerStopped', isStopped ? 'true' : 'false');
            const btn = document.getElementById('tickerControlBtn');
            if (btn) updateTickerControlUI(btn, isStopped);
        });
    }

    function updateTickerControlUI(btn, stopped) {
        btn.textContent = stopped ? '▶' : '⏸';
        btn.title = stopped ? 'Resume ticker' : 'Pause ticker';
        btn.style.fontSize = '12px';
        btn.style.padding = '4px 8px';
        btn.style.marginLeft = '8px';
        btn.style.border = 'none';
        btn.style.background = 'rgba(255,255,255,0.08)';
        btn.style.color = 'white';
        btn.style.borderRadius = '6px';
        btn.style.cursor = 'pointer';
    }

    // --- Stats auto-refresh (keeps UI in sync with DB-driven endpoints)
    async function refreshAllCountsOnce() {
        // Overview stats (server endpoint must return object like { total_terms, favorites, bookmarks, recent_views })
        const overview = await safeFetchJson('/api/stats/overview', {});
        if (overview) {
            // Update various elements if present
            const setIf = (id, value) => {
                const el = document.getElementById(id);
                if (el && (value !== undefined && value !== null)) el.textContent = Number(value).toLocaleString();
            };

            setIf('totalTermsCount', overview.total_terms);
            setIf('homeStatTerms', overview.total_terms);
            setIf('homeStatFavorites', overview.favorites);
            setIf('favCount', overview.favorites);
            setIf('homeStatCollections', (window.userCollections || []).length);
            // replace setIf('sessionTermsCount', window.sessionTerms || 0);
            const sessCount = (typeof sessionTerms !== 'undefined') ? sessionTerms : (window.sessionTerms || 0);
            setIf('sessionTermsCount', sessCount);
            setIf('homeStatSubjects', document.getElementById('homeStatSubjects') ? document.getElementById('homeStatSubjects').textContent : '');
        }

        // meta counts like notes/difficulty (falls back to /api/meta/counts)
        const meta = await safeFetchJson('/api/meta/counts', {});
        if (meta) {
            const setIf = (id, value) => {
                const el = document.getElementById(id);
                if (el && (value !== undefined && value !== null)) el.textContent = Number(value).toLocaleString();
            };
            setIf('notesCount', meta.with_notes);
            setIf('easyCount', meta.easy);
            setIf('mediumCount', meta.medium);
            setIf('hardCount', meta.hard);
        }

        // Update stats view counts if currently visible
        if (currentView === 'stats') {
            // call existing renderStatsView which will fetch fresh overview too (if implemented)
            try { renderStatsView(); } catch (e) { /* ignore */ }
        }
    }

    async function pollCountsPeriodically() {
        // initial immediate refresh
        await refreshAllCountsOnce();

        // periodic polling
        setInterval(refreshAllCountsOnce, STATS_POLL_INTERVAL_MS);

        // subjects (for subject tiles & counts)
        setInterval(async () => {
            const subjects = await safeFetchJson('/api/subjects', []);
            if (Array.isArray(subjects)) {
                window.allSubjects = subjects; // keep global in sync
                // re-render previews if exist
                try { renderSubjectsPreview(); } catch (e) { /* ignore */ }
                try { updateHomeStats(); } catch (e) { /* ignore */ }
            }
        }, SUBJECTS_POLL_INTERVAL_MS);
    }

    // --- Features page: inject developer cards (append-only injection)
    function injectDevelopersInFeatures() {
        const featuresView = document.getElementById('featuresView');
        if (!featuresView) return;

        // Avoid injecting multiple times
        if (document.getElementById('devCardsContainer')) return;

        // Data for two developers (edit these objects or read from server later)
        const devs = [
            {
                name: 'Maninder Singh',
                designation: 'Lead Developer & System Architect',
                school: 'School of Eminence Amloh',
                block: 'Amloh',
                district: 'Fatehgarh Sahib',
                state: 'Punjab',
                department: 'Department of School Education Punjab',
                doj_job: '22.09.2009',
                doj_school: '24-12-2011',
                mobile: '98555-33266',
                email: 'mavinms@gmail.com',
                dob: '21-06-1982',
                photo: '/web/images/dev1.jpg' // place photo at this path or fallback to initials
            },
            {
                name: 'Pooja Goel',
                designation: 'Team Coordinator (Project Support)',
                school: 'School of Eminence Khamano',
                block: 'Khamano',
                district: 'Fatehgarh Sahib',
                state: 'Punjab',
                department: 'Department of School Education Punjab',
                doj_job: '07-08-2013',
                doj_school: '07-08-2013',
                mobile: '99142-54777',
                email: 'mailmepooja142@gmail.com',
                dob: '26-07-1982',
                photo: '/web/images/dev2.jpg'
            }
        ];

        // Build markup
        const container = document.createElement('div');
        container.id = 'devCardsContainer';
        container.className = 'dev-cards-wrapper';

        const cards = devs.map(dev => {
            // ensure safe HTML
            const photoExists = true; // we attempt to load, fallback handled by onerror in img tag
            const photoMarkup = `<img src="${dev.photo}" alt="${escapeHtml(dev.name)}" class="dev-avatar" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,${encodeURIComponent(generateInitialsSVG(dev.name))}';">`;

            const fields = [
                ['Designation', dev.designation],
                ['School', dev.school],
                ['Block', dev.block],
                ['District', dev.district],
                ['State', dev.state],
                ['Department', dev.department],
                ['Date of Joining (Job)', dev.doj_job],
                ['Date of Joining (Current School)', dev.doj_school],
                ['Mobile', dev.mobile],
                ['Email', dev.email],
                ['Date of Birth', dev.dob]
            ];

            const rows = fields.map(f => `<div class="dev-row"><div class="dev-row-key">${escapeHtml(f[0])}</div><div class="dev-row-val">${escapeHtml(f[1] || '—')}</div></div>`).join('');

            return `
                <div class="dev-card">
                    <div class="dev-card-head">
                        <div class="dev-photo-wrap">${photoMarkup}</div>
                        <div class="dev-basics">
                            <div class="dev-name">${escapeHtml(dev.name)}</div>
                            <div class="dev-designation">${escapeHtml(dev.designation)}</div>
                        </div>
                    </div>
                    <div class="dev-card-body">
                        ${rows}
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<h3 class="dev-section-title">Core Developers</h3><div class="dev-cards">${cards}</div>`;

        // Append to featuresView footer area if present, else append to the view
        const footer = featuresView.querySelector('.features-footer');
        if (footer) footer.parentNode.insertBefore(container, footer.nextSibling);
        else featuresView.appendChild(container);
    }

    // helper to make inline SVG avatar for initials
    function generateInitialsSVG(name) {
        const initials = (name || '').split(' ').map(s => s[0] || '').slice(0, 2).join('').toUpperCase() || 'P';
        const bg = '#7c3aed';
        const fg = '#fff';
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' font-family='Inter, Arial, sans-serif' font-size='120' text-anchor='middle' fill='${fg}' dy='.35em'>${initials}</text></svg>`;
        return svg;
    }

    // safe escape for text insertion
    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // wire up when the DOM is ready (non-destructive)
    function init() {
        try {
            ensureTickerControls(); // adds delayed running and control
        } catch (e) {
            console.warn('Ticker ensure failed', e);
        }

        try {
            pollCountsPeriodically(); // keeps UI counts in sync with DB
        } catch (e) {
            console.warn('Stats poll failed', e);
        }

        // inject developer cards when features view is shown (also inject now if features is currently visible)
        function ensureDevInjection() {
            try {
                injectDevelopersInFeatures();
            } catch (e) {
                console.warn('Dev inject failed', e);
            }
        }

        // if user clicks nav to features, inject there
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.view === 'features') setTimeout(ensureDevInjection, 50);
            });
        });

        // if features view already active (app load), inject now
        if (document.getElementById('featuresView')?.classList.contains('active')) {
            setTimeout(ensureDevInjection, 400);
        }
    }

    // kick off after DOMContentLoaded (non-destructive)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 50);
    }

})();
/* ---- APPEND-ONLY: Immediate ticker start, full-print, full-page screenshot, dev-cards-top ---- */
(function prismPrintScreenshotTickerAppend() {
    // ---------- 1. Ensure ticker starts immediately (no delay) ----------
    try {
        const startTickerImmediately = () => {
            const ticker = document.getElementById('copyrightTicker');
            if (!ticker) return;
            // If user previously chose to stop ticker, respect that
            const stopped = localStorage.getItem('tickerStopped') === 'true';
            if (!stopped) ticker.classList.add('running'); // start animation immediately
            // keep existing click-to-toggle behavior intact (non-destructive)
            ticker.addEventListener('click', () => {
                const nowStopped = ticker.classList.toggle('stopped');
                if (nowStopped) ticker.classList.remove('running'); else ticker.classList.add('running');
                localStorage.setItem('tickerStopped', nowStopped ? 'true' : 'false');
            });
        };

        // call as soon as possible
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startTickerImmediately);
        } else {
            startTickerImmediately();
        }
    } catch (e) {
        console.warn('Ticker immediate start failed', e);
    }

    // ---------- 2. Full-page print of main content only (no sidebar) ----------
    function printMainContent() {
        try {
            const main = document.querySelector('.main-content');
            if (!main) { window.print(); return; }

            // Clone main content so we don't affect live DOM
            const clone = main.cloneNode(true);

            // Build a minimal printable HTML
            const title = document.title || 'PRISM-print';
            const printHtml = `
                <!doctype html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${title}</title>
                    <meta name="viewport" content="width=device-width,initial-scale=1">
                    <link rel="stylesheet" href="/web/style.css">
                    <style>
                        /* Ensure full vertical content, hide nav & other fixed elements that aren't needed */
                        body { margin:0; padding:20px; background: white; color: #111; }
                        .app-container, .sidebar, .copyright-ticker { display: none !important; }
                        .main-content, .content-wrapper { display: block !important; overflow: visible !important; max-height: none !important; }
                        /* ensure printed sections expand */
                        .section, .term-detail, .term-header, .term-actions { page-break-inside: avoid; }
                    </style>
                </head>
                <body>
                    <div id="print-root"></div>
                    <script>
                        // fix for fonts that rely on remote fonts - keep simple
                        window.onload = function(){ setTimeout(function(){ window.print(); setTimeout(()=>window.close(), 200); }, 250); };
                    </script>
                </body>
                </html>
            `.trim();

            // open new window and write cloned content
            const w = window.open('', '_blank', 'noopener');
            if (!w) { alert('Popup blocked: allow popups for this site to print'); return; }
            w.document.open();
            w.document.write(printHtml);
            w.document.close();

            // Insert cloned main content after the document is ready
            w.addEventListener('load', () => {
                const root = w.document.getElementById('print-root');
                if (root) root.appendChild(w.document.importNode(clone, true));
            });
        } catch (err) {
            console.error('printMainContent failed:', err);
            window.print(); // fallback
        }
    }

    // ---------- 3. Full-page screenshot (html2canvas dynamic load) ----------
    async function ensureHtml2Canvas() {
        if (window.html2canvas) return window.html2canvas;
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve(window.html2canvas || window.html2canvas); // html2canvas creates window.html2canvas
            s.onerror = (e) => reject(e);
            document.head.appendChild(s);
        });
    }

    function sanitizeFilenamePart(s) {
        if (!s) return '';
        return String(s).replace(/[\/\\:*?"<>|,]+/g, '_').replace(/\s+/g, '_');
    }

    async function captureFullMainScreenshot() {
        try {
            await ensureHtml2Canvas();
            const el = document.querySelector('.content-wrapper') || document.querySelector('.main-content');
            if (!el) { alert('No content to capture'); return; }

            // Temporarily expand element to its scrollHeight (ensures html2canvas captures full vertical area)
            const originalStyle = { width: el.style.width || '', height: el.style.height || '', overflow: el.style.overflow || '' };
            el.style.height = el.scrollHeight + 'px';
            el.style.overflow = 'visible';

            // html2canvas options to capture full content
            const canvas = await window.html2canvas(el, {
                allowTaint: true,
                useCORS: true,
                scrollX: -window.scrollX,
                scrollY: -window.scrollY,
                windowWidth: document.documentElement.scrollWidth,
                windowHeight: document.documentElement.scrollHeight
            });

            // restore styles
            el.style.width = originalStyle.width;
            el.style.height = originalStyle.height;
            el.style.overflow = originalStyle.overflow;

            // Build filename: term_subject_timestamp or fullpage_timestamp
            const now = new Date();
            const ts = now.toISOString().replace(/[:.]/g, '-');
            const term = (window.currentTerm && window.currentTerm.term) ? sanitizeFilenamePart(window.currentTerm.term) : 'fullpage';
            const subject = (window.currentTerm && window.currentTerm.subject) ? sanitizeFilenamePart(window.currentTerm.subject) : '';
            const nameParts = subject ? `${term}_${subject}_${ts}` : `${term}_${ts}`;
            const filename = `${nameParts}.png`;

            // download
            canvas.toBlob(function (blob) {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    URL.revokeObjectURL(a.href);
                    a.remove();
                }, 2000);
            }, 'image/png');

        } catch (e) {
            console.error('captureFullMainScreenshot failed', e);
            alert('Screenshot failed. Check console for details.');
        }
    }

    // ---------- 4. Move developer cards to top of features page and improve injection timing ----------
    function moveDevCardsToTopAndStyle() {
        try {
            const featuresView = document.getElementById('featuresView');
            if (!featuresView) return;

            // find existing dev container added previously (if any)
            const existing = document.getElementById('devCardsContainer');
            if (!existing) return;

            // move it to top of features page content (before hero)
            const hero = featuresView.querySelector('.features-hero');
            if (hero) {
                hero.parentNode.insertBefore(existing, hero.nextSibling); // place right after hero
            } else {
                featuresView.insertBefore(existing, featuresView.firstChild);
            }

            // add an extra class for elegant styling (CSS appended separately)
            existing.classList.add('dev-cards-top', 'dev-cards-elegant');
        } catch (e) {
            console.warn('moveDevCardsToTopAndStyle failed', e);
        }
    }

    // ---------- 5. Wire up buttons and events (append-only) ----------
    function wireUpPrintAndScreenshot() {
        // Replace print behavior (non-destructive: remove old listener if present and add new)
        const printBtn = document.getElementById('printBtn');
        if (printBtn) {
            // remove existing onclicks by cloning
            const newPrintBtn = printBtn.cloneNode(true);
            printBtn.parentNode.replaceChild(newPrintBtn, printBtn);
            newPrintBtn.addEventListener('click', (e) => {
                e.preventDefault();
                printMainContent();
            });
        }

        // Add screenshot button if not present
        if (!document.getElementById('screenshotBtn')) {
            const btn = document.createElement('button');
            btn.id = 'screenshotBtn';
            btn.className = 'icon-btn';
            btn.title = 'Screenshot full page';
            btn.innerText = '📸';
            // add to toolbar-right
            const toolbarRight = document.querySelector('.toolbar-right');
            if (toolbarRight) {
                toolbarRight.insertBefore(btn, toolbarRight.firstChild);
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await captureFullMainScreenshot();
                });
            }
        }
    }

    // ---------- 6. Initialization ----------
    function initEnhancements() {
        try {
            wireUpPrintAndScreenshot();
            moveDevCardsToTopAndStyle();
        } catch (e) {
            console.warn('initEnhancements failed', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEnhancements);
    } else {
        setTimeout(initEnhancements, 50);
    }

})();
/**
 * Generates the HTML string for the dynamic external resource links,
 * displayed as small, horizontal buttons with minimal text.
 * This function should be located at the bottom of your script.js file.
 * @param {string} term The current term being viewed (raw, unencoded).
 * @returns {string} The HTML string for the resource section.
 */
function getExternalResourceHtml(term) {
    if (!term) return ''; // Safety check

    // 1. URL-Encoded Term (used for simple queries)
    const safeTerm = encodeURIComponent(term);

    // 2. Display Term (escaped for HTML safety) - Used only for link titles.
    const displayTerm = typeof escapeHtml === 'function' ? escapeHtml(term) : term;

    // 3. Raw Query Strings (used for complex Google search operators)
    const ncertQueryString = `${term} site:ncert.nic.in`;
    const pptQueryString = `${term} filetype:ppt OR filetype:pptx`;
    const scholarlyQueryString = `${term} site:academia.edu OR site:researchgate.net`;
    const pdfQueryString = `${term} filetype:pdf`;
    const quoraGoogleQueryString = `${term} site:quora.com`;
    const tutorialQueryString = `${term} tutorial OR notes OR guide`;

    // 4. External Site URLs
    const howStuffWorksUrl = `https://s.howstuffworks.com/serp?q=${safeTerm}`;

    // 5. Specific Khan Academy URLs (using the observed structure)
    // The query parameter is page_search_query, and we include referer=%2F
    const khanAcademySimpleUrl = `https://www.khanacademy.org/search?referer=%2F&page_search_query=${safeTerm}`;
    const khanAcademyArticlesUrl = `https://www.khanacademy.org/search?referer=%2F&page_search_query=${safeTerm}&content_kinds=Article`;
    const khanAcademyVideosUrl = `https://www.khanacademy.org/search?referer=%2F&page_search_query=${safeTerm}&content_kinds=Video`;
    const khanAcademyTopicsUrl = `https://www.khanacademy.org/search?referer=%2F&page_search_query=${safeTerm}&content_kinds=Topic`;


    return `
        <div class="section external-resources">
            <h2 class="section-title">🔗 External Resources</h2>
            <div class="resource-links-grid">
                
                <a href="https://www.perplexity.ai/search?q=${safeTerm}" target="_blank" class="resource-link ai-link ai-answer" title="Perplexity: Full Answer">
                    <span class="link-icon">🤖</span> Perplexity
                </a>
                
                <a href="https://www.google.com/search?q=${encodeURIComponent(tutorialQueryString)}" target="_blank" class="resource-link tutorial-link" title="Search Google for Best Tutorials, Notes, and Guides">
                    <span class="link-icon">⭐</span> Best Tutorials
                </a>
                <a href="https://www.google.com/search?q=${encodeURIComponent(pdfQueryString)}" target="_blank" class="resource-link pdf-link" title="Search Google for PDF Files">
                    <span class="link-icon">📄</span> PDFs
                </a>
                <a href="https://www.google.com/search?q=${encodeURIComponent(pptQueryString)}" target="_blank" class="resource-link ppt-link" title="Search Google for PPT/Presentation Files">
                    <span class="link-icon">🖥️</span> PPTs
                </a>
                
                <a href="https://en.wikipedia.org/wiki/Special:Search?search=${safeTerm}" target="_blank" class="resource-link wiki-link" title="Search Wikipedia">
                    <span class="link-icon">🌐</span> Wikipedia
                </a>

                <a href="https://www.google.com/search?q=${encodeURIComponent(quoraGoogleQueryString)}" target="_blank" class="resource-link qa-link" title="Search Quora via Google (Avoids Login)">
                    <span class="link-icon">💬</span> Quora
                </a>
                
                <a href="https://www.google.com/search?q=${encodeURIComponent(scholarlyQueryString)}" target="_blank" class="resource-link research-link" title="Search Scholarly Articles (Academia/ResearchGate)">
                    <span class="link-icon">🔬</span> Academia/RG
                </a>
                
                <a href="https://www.google.com/search?q=${encodeURIComponent(ncertQueryString)}" target="_blank" class="resource-link ncert-link" title="Search NCERT/Indian Education Documents">
                    <span class="link-icon">🇮🇳</span> NCERT
                </a>

                <a href="${howStuffWorksUrl}" target="_blank" class="resource-link hsw-link" title="Search HowStuffWorks">
                    <span class="link-icon">⚙️</span> HowStuffWorks
                </a>

                <a href="${khanAcademySimpleUrl}" target="_blank" class="resource-link khan-link" title="Khan Academy: All Content">
                    <span class="link-icon">🎓</span> Khan Academy
                </a>
                <a href="${khanAcademyArticlesUrl}" target="_blank" class="resource-link khan-link" title="Khan Academy: Articles">
                    <span class="link-icon">📰</span> Articles
                </a>
                <a href="${khanAcademyVideosUrl}" target="_blank" class="resource-link khan-link" title="Khan Academy: Videos">
                    <span class="link-icon">🎞️</span> Videos
                </a>
                <a href="${khanAcademyTopicsUrl}" target="_blank" class="resource-link khan-link" title="Khan Academy: Courses/Units/Lessons">
                    <span class="link-icon">📚</span> Courses
                </a>
                
                <a href="https://www.youtube.com/results?search_query=${safeTerm}" target="_blank" class="resource-link youtube-link" title="Search YouTube Videos">
                    <span class="link-icon">▶️</span> YouTube
                </a>
                
            </div>
        </div>
    `;
}