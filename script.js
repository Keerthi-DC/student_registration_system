/**
 * script.js — Student Registration System
 *
 * Features:
 *  - Add / Edit / Delete student records
 *  - LocalStorage persistence (data survives page refresh)
 *  - Client-side validation (name, ID, email, phone)
 *  - Live search / filter
 *  - Dynamic vertical scrollbar (added via JS once rows > 5)
 *  - Toast notifications & confirm-delete modal
 *  - Column sorting
 *  - Stats counters
 */

/* ── Constants ── */
const STORAGE_KEY = 'srs_students';    // Key used in localStorage
const MAX_TABLE_VISIBLE_ROWS = 5;      // Rows before vertical scrollbar appears
const ROW_HEIGHT_PX = 56;              // Approximate height of one table row

/* ── State ── */
let students      = [];   // Master array of student objects
let editingId     = null; // ID of the record currently being edited (null = adding new)
let deleteTargetId = null; // ID queued for deletion confirmation
let sortKey       = null; // Currently sorted column key
let sortDir       = 'asc'; // 'asc' or 'desc'
let searchQuery   = '';   // Live search filter string

/* ══════════════════════════════════════════
   INITIALISATION
══════════════════════════════════════════ */

/**
 * Runs when the DOM is fully loaded.
 * Loads data from localStorage, renders the table, and binds all events.
 */
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  renderTable();
  updateStats();
  bindFormEvents();
  bindSearchEvents();
  bindModalEvents();
  bindNavScrollEvents();
});

/* ══════════════════════════════════════════
   STORAGE HELPERS
══════════════════════════════════════════ */

/** Read student array from localStorage. Falls back to [] on parse error. */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    students = raw ? JSON.parse(raw) : [];
  } catch {
    students = [];
  }
}

/** Persist current student array to localStorage. */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

/* ══════════════════════════════════════════
   UNIQUE ID GENERATION
══════════════════════════════════════════ */

/**
 * Generates a simple unique key for each student record.
 * Uses timestamp + random suffix to avoid collisions.
 */
function generateKey() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

/* ══════════════════════════════════════════
   VALIDATION
══════════════════════════════════════════ */

/**
 * Validates all form fields.
 * Displays inline error messages and applies error CSS classes.
 *
 * @returns {boolean} true if all fields are valid, false otherwise.
 */
function validateForm() {
  let valid = true;

  const fields = {
    studentName:  document.getElementById('studentName'),
    studentId:    document.getElementById('studentId'),
    emailId:      document.getElementById('emailId'),
    contactNumber:document.getElementById('contactNumber'),
  };

  /* ── Name: letters, spaces, hyphens only ── */
  const nameVal = fields.studentName.value.trim();
  if (!nameVal) {
    showFieldError('studentName', 'Name is required.');
    valid = false;
  } else if (!/^[A-Za-z\s\-'.]+$/.test(nameVal)) {
    showFieldError('studentName', 'Name must contain only letters.');
    valid = false;
  } else {
    clearFieldError('studentName');
  }

  /* ── Student ID: digits only ── */
  const idVal = fields.studentId.value.trim();
  if (!idVal) {
    showFieldError('studentId', 'Student ID is required.');
    valid = false;
  } else if (!/^\d+$/.test(idVal)) {
    showFieldError('studentId', 'Student ID must be numeric.');
    valid = false;
  } else if (isDuplicateId(idVal)) {
    showFieldError('studentId', 'This Student ID already exists.');
    valid = false;
  } else {
    clearFieldError('studentId');
  }

  /* ── Email: standard email format ── */
  const emailVal = fields.emailId.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailVal) {
    showFieldError('emailId', 'Email is required.');
    valid = false;
  } else if (!emailRegex.test(emailVal)) {
    showFieldError('emailId', 'Enter a valid email address.');
    valid = false;
  } else {
    clearFieldError('emailId');
  }

  /* ── Contact: digits only, minimum 10 digits ── */
  const contactVal = fields.contactNumber.value.trim();
  if (!contactVal) {
    showFieldError('contactNumber', 'Contact number is required.');
    valid = false;
  } else if (!/^\d{10,}$/.test(contactVal)) {
    showFieldError('contactNumber', 'Enter a valid number (min 10 digits).');
    valid = false;
  } else {
    clearFieldError('contactNumber');
  }

  return valid;
}

/**
 * Checks if the given student ID is already in use by another record.
 * Excludes the currently-edited record to allow saving without ID change.
 *
 * @param {string} id - Student ID to check.
 * @returns {boolean}
 */
function isDuplicateId(id) {
  return students.some(s => s.studentId === id && s._key !== editingId);
}

/** Display inline error message for a specific field. */
function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errEl = document.getElementById(`${fieldId}Error`);
  if (input) { input.classList.add('error'); input.classList.remove('success'); }
  if (errEl)  { errEl.textContent = message; errEl.style.display = 'block'; }
}

/** Clear inline error state for a specific field. */
function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const errEl = document.getElementById(`${fieldId}Error`);
  if (input) { input.classList.remove('error'); input.classList.add('success'); }
  if (errEl)  { errEl.style.display = 'none'; }
}

/* Real-time validation clears errors as user types */
['studentName','studentId','emailId','contactNumber'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => clearFieldError(id));
});

/* ══════════════════════════════════════════
   FORM EVENTS
══════════════════════════════════════════ */

/** Binds submit and reset button clicks for the registration form. */
function bindFormEvents() {
  document.getElementById('registrationForm').addEventListener('submit', handleFormSubmit);
  document.getElementById('resetBtn').addEventListener('click', resetForm);
}

/**
 * Handles form submission.
 * Runs validation; if valid, either adds a new record or updates an existing one.
 *
 * @param {Event} e - The form submit event.
 */
function handleFormSubmit(e) {
  e.preventDefault();

  /* Prevent submission of completely empty form */
  const allEmpty = ['studentName','studentId','emailId','contactNumber']
    .every(id => !document.getElementById(id).value.trim());
  if (allEmpty) {
    showToast('Please fill in at least one field.', 'error');
    return;
  }

  if (!validateForm()) return;

  const record = {
    studentName:   document.getElementById('studentName').value.trim(),
    studentId:     document.getElementById('studentId').value.trim(),
    emailId:       document.getElementById('emailId').value.trim(),
    contactNumber: document.getElementById('contactNumber').value.trim(),
    registeredAt:  new Date().toLocaleDateString('en-IN'),
  };

  if (editingId) {
    /* Update existing record — preserve original key and date */
    const idx = students.findIndex(s => s._key === editingId);
    if (idx !== -1) {
      record._key         = students[idx]._key;
      record.registeredAt = students[idx].registeredAt;
      students[idx] = record;
      showToast('Record updated successfully!', 'success');
    }
    editingId = null;
    document.getElementById('formTitle').textContent  = 'Register Student';
    document.getElementById('formSubtitle').textContent = 'Fill in the details to add a new student.';
    document.getElementById('submitBtn').innerHTML   = '✚ Add Student';
  } else {
    /* Add new record */
    record._key = generateKey();
    students.push(record);
    showToast('Student registered successfully!', 'success');
  }

  saveToStorage();
  resetForm();
  renderTable();
  updateStats();

  /* Smoothly scroll down to the records section */
  document.getElementById('recordsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Resets all form fields and clears validation state. */
function resetForm() {
  document.getElementById('registrationForm').reset();
  ['studentName','studentId','emailId','contactNumber'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('error', 'success'); }
    const err = document.getElementById(`${id}Error`);
    if (err) err.style.display = 'none';
  });
  editingId = null;
  document.getElementById('formTitle').textContent    = 'Register Student';
  document.getElementById('formSubtitle').textContent = 'Fill in the details to add a new student.';
  document.getElementById('submitBtn').innerHTML = '✚ Add Student';
}

/* ══════════════════════════════════════════
   SEARCH & SORT
══════════════════════════════════════════ */

/** Wires the live search input to filter the table. */
function bindSearchEvents() {
  document.getElementById('searchInput').addEventListener('input', function () {
    searchQuery = this.value.trim().toLowerCase();
    renderTable();
  });
}

/**
 * Returns a filtered (and optionally sorted) copy of the students array
 * based on current searchQuery, sortKey, and sortDir.
 *
 * @returns {Array} Processed student records.
 */
function getProcessedStudents() {
  let list = [...students];

  /* Filter by search query (checks all visible fields) */
  if (searchQuery) {
    list = list.filter(s =>
      s.studentName.toLowerCase().includes(searchQuery)   ||
      s.studentId.toLowerCase().includes(searchQuery)     ||
      s.emailId.toLowerCase().includes(searchQuery)       ||
      s.contactNumber.includes(searchQuery)
    );
  }

  /* Sort if a column is selected */
  if (sortKey) {
    list.sort((a, b) => {
      const av = (a[sortKey] || '').toString().toLowerCase();
      const bv = (b[sortKey] || '').toString().toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  return list;
}

/**
 * Called when a table header is clicked to sort that column.
 * Toggles direction if the same column is clicked again.
 *
 * @param {string} key - The data field key to sort by.
 */
function handleSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey = key;
    sortDir = 'asc';
  }
  renderTable();
}

/* ══════════════════════════════════════════
   TABLE RENDERING
══════════════════════════════════════════ */

/**
 * Main render function — builds the records table from current state.
 * Also applies the dynamic vertical scrollbar when needed.
 */
function renderTable() {
  const tbody      = document.getElementById('tableBody');
  const countLabel = document.getElementById('recordCount');
  const data       = getProcessedStudents();

  /* Update count label */
  countLabel.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;

  /* Clear existing rows */
  tbody.innerHTML = '';

  if (data.length === 0) {
    /* Empty state row */
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="6">
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h3>${searchQuery ? 'No results found' : 'No students registered yet'}</h3>
          <p>${searchQuery ? 'Try a different search term.' : 'Register your first student using the form above.'}</p>
        </div>
      </td>`;
    tbody.appendChild(tr);
  } else {
    /* Build one row per student */
    data.forEach((s, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.key = s._key;

      /* Avatar initials (first letter of first + last name) */
      const parts    = s.studentName.trim().split(' ');
      const initials = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();

      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>
          <span class="name-cell">
            <span class="avatar">${initials}</span>
            ${escapeHtml(s.studentName)}
          </span>
        </td>
        <td><span class="badge-id">${escapeHtml(s.studentId)}</span></td>
        <td>${escapeHtml(s.emailId)}</td>
        <td>${escapeHtml(s.contactNumber)}</td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm btn-edit"
                    id="edit-btn-${s._key}"
                    onclick="handleEdit('${s._key}')"
                    title="Edit record">
              ✏️ Edit
            </button>
            <button class="btn btn-sm btn-delete"
                    id="delete-btn-${s._key}"
                    onclick="handleDeletePrompt('${s._key}')"
                    title="Delete record">
              🗑 Delete
            </button>
          </div>
        </td>`;

      tbody.appendChild(tr);
    });
  }

  /* Update sort indicators in headers */
  document.querySelectorAll('.data-table thead th[data-sort]').forEach(th => {
    const key     = th.dataset.sort;
    const icon    = th.querySelector('.sort-icon');
    const isSorted = key === sortKey;
    th.classList.toggle('sorted', isSorted);
    if (icon) icon.textContent = isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
  });

  /* Apply vertical scrollbar dynamically (Task 6 requirement) */
  applyDynamicScrollbar(data.length);
}

/**
 * Dynamically adds or removes a vertical scrollbar on the table container.
 * The scrollbar appears once the visible row count exceeds MAX_TABLE_VISIBLE_ROWS.
 * This is done entirely via JavaScript as required by the assignment.
 *
 * @param {number} rowCount - Number of rows currently rendered.
 */
function applyDynamicScrollbar(rowCount) {
  const container = document.getElementById('tableContainer');
  if (!container) return;

  if (rowCount > MAX_TABLE_VISIBLE_ROWS) {
    /* Enable vertical scrollbar with a calculated max height */
    const headerHeight = 46;
    const maxH = headerHeight + MAX_TABLE_VISIBLE_ROWS * ROW_HEIGHT_PX;
    container.style.maxHeight = `${maxH}px`;
    container.style.overflowY = 'auto';
  } else {
    /* Disable scrollbar — show all rows without clipping */
    container.style.maxHeight = 'none';
    container.style.overflowY = 'visible';
  }
}

/* ══════════════════════════════════════════
   EDIT RECORD
══════════════════════════════════════════ */

/**
 * Populates the form with an existing student's data for editing.
 *
 * @param {string} key - The internal _key of the student to edit.
 */
function handleEdit(key) {
  const student = students.find(s => s._key === key);
  if (!student) return;

  editingId = key;

  /* Populate fields */
  document.getElementById('studentName').value    = student.studentName;
  document.getElementById('studentId').value      = student.studentId;
  document.getElementById('emailId').value        = student.emailId;
  document.getElementById('contactNumber').value  = student.contactNumber;

  /* Update form UI to reflect edit mode */
  document.getElementById('formTitle').textContent    = 'Edit Student';
  document.getElementById('formSubtitle').textContent = 'Modify the details below and save.';
  document.getElementById('submitBtn').innerHTML      = '💾 Save Changes';

  /* Scroll form into view */
  document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('Editing record — make your changes.', 'info');
}

/* ══════════════════════════════════════════
   DELETE RECORD
══════════════════════════════════════════ */

/**
 * Opens the confirmation modal before deleting a student record.
 *
 * @param {string} key - The internal _key of the student to delete.
 */
function handleDeletePrompt(key) {
  const student = students.find(s => s._key === key);
  if (!student) return;

  deleteTargetId = key;

  /* Inject student name into modal message */
  document.getElementById('deleteStudentName').textContent = student.studentName;

  /* Open modal */
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
}

/** Binds confirm / cancel buttons inside the delete modal. */
function bindModalEvents() {
  document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
    if (!deleteTargetId) return;
    students = students.filter(s => s._key !== deleteTargetId);
    saveToStorage();
    renderTable();
    updateStats();
    showToast('Student record deleted.', 'error');
    closeModal();
  });

  document.getElementById('cancelDeleteBtn').addEventListener('click', closeModal);

  /* Allow clicking the backdrop to dismiss */
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });
}

/** Closes the delete confirmation modal. */
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  deleteTargetId = null;
}

/* ══════════════════════════════════════════
   STATS
══════════════════════════════════════════ */

/** Updates the header stats counters with current data counts. */
function updateStats() {
  document.getElementById('statTotal').textContent = students.length;

  /* Count unique classes (placeholder: all students counted as 'Active') */
  document.getElementById('statActive').textContent = students.length;
}

/* ══════════════════════════════════════════
   TOAST NOTIFICATIONS
══════════════════════════════════════════ */

/**
 * Displays a temporary toast notification at the bottom-right of the screen.
 *
 * @param {string} message - The text to display.
 * @param {'success'|'error'|'info'} type - Determines icon and colour.
 * @param {number} [duration=3500] - Time in ms before the toast disappears.
 */
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);

  /* Auto-remove after duration */
  setTimeout(() => {
    toast.classList.add('hide');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

/* ══════════════════════════════════════════
   NAVIGATION SMOOTH SCROLL
══════════════════════════════════════════ */

/**
 * Wires navbar anchor links to smooth-scroll to their target sections
 * while preventing the default jump behaviour.
 */
function bindNavScrollEvents() {
  document.querySelectorAll('.navbar-links a[href^="#"]').forEach(link => {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.getElementById(this.getAttribute('href').slice(1));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });

      /* Update active nav link */
      document.querySelectorAll('.navbar-links a').forEach(a => a.classList.remove('active'));
      this.classList.add('active');
    });
  });
}

/* ══════════════════════════════════════════
   UTILITY
══════════════════════════════════════════ */

/**
 * Escapes HTML special characters to prevent XSS when rendering user input.
 *
 * @param {string} str - Raw user-supplied string.
 * @returns {string} Escaped safe string.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
