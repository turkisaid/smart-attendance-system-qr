/* =============================================
   UTAS–Sohar Attendance System — main.js
   ============================================= */

const API_BASE = window.location.origin + '/attendance-system/backend';

/* =============================================
   SECTION 1: API helper
   All fetch() calls go through here.
   Throws an Error with the server's message on non-2xx.
   ============================================= */
async function apiFetch(endpoint, options = {}) {
  const session = getSessionUser();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.token) headers['Authorization'] = 'Bearer ' + session.token;

  const res  = await fetch(`${API_BASE}/${endpoint}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data;
}

/* =============================================
   SECTION 2: Login page
   ============================================= */
function initLoginPage() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  // Already logged in — skip straight to the dashboard
  const existing = getSessionUser();
  if (existing) { redirectByRole(existing.role); return; }

  const roleTabs      = document.querySelectorAll('.role-tab');
  const selectedRole  = document.getElementById('selectedRole');
  const emailInput    = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const toggleBtn     = document.getElementById('togglePassword');
  const toggleIcon    = document.getElementById('toggleIcon');
  const loginBtn      = document.getElementById('loginBtn');
  const loginBtnText  = document.getElementById('loginBtnText');
  const loginSpinner  = document.getElementById('loginSpinner');
  const loginAlert    = document.getElementById('loginAlert');
  const loginAlertMsg = document.getElementById('loginAlertMsg');
  const emailError    = document.getElementById('emailError');
  const passwordError = document.getElementById('passwordError');

  /* ----- Role tab switching ----- */
  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      roleTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedRole.value = tab.dataset.role;
      clearErrors();
    });
  });

  /* ----- Password visibility toggle ----- */
  toggleBtn.addEventListener('click', () => {
    const isPass = passwordInput.type === 'password';
    passwordInput.type   = isPass ? 'text' : 'password';
    toggleIcon.className = isPass ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });

  /* ----- Clear errors on typing ----- */
  emailInput.addEventListener('input',    () => { emailInput.classList.remove('is-invalid');    emailError.textContent = '';    hideAlert(); });
  passwordInput.addEventListener('input', () => { passwordInput.classList.remove('is-invalid'); passwordError.textContent = ''; hideAlert(); });

  /* ----- Form submit ----- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    await performLogin();
  });

  function validateForm() {
    let valid = true;
    clearErrors();
    const emailVal = emailInput.value.trim();
    const passVal  = passwordInput.value;

    if (!emailVal) {
      showFieldError(emailInput, emailError, 'Email address is required.');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      showFieldError(emailInput, emailError, 'Please enter a valid email address.');
      valid = false;
    }
    if (!passVal) {
      showFieldError(passwordInput, passwordError, 'Password is required.');
      valid = false;
    } else if (passVal.length < 6) {
      showFieldError(passwordInput, passwordError, 'Password must be at least 6 characters.');
      valid = false;
    }
    return valid;
  }

  async function performLogin() {
    setLoading(true);
    try {
      const data = await apiFetch('login.php', {
        method: 'POST',
        body:   JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
      });

      // Persist session — localStorage survives tab close (unlike sessionStorage)
      localStorage.setItem('att_session', JSON.stringify({
        user_id: data.user_id,
        name:    data.name,
        email:   data.email,
        role:    data.role,
        token:   data.token,
      }));

      redirectByRole(data.role);
    } catch (err) {
      setLoading(false);
      showAlert(err.message || 'Login failed. Please check your credentials.');
    }
  }

  function setLoading(on) {
    loginBtn.disabled            = on;
    loginBtnText.textContent     = on ? 'Signing in…' : 'Sign In';
    loginSpinner.style.display   = on ? 'inline-block' : 'none';
  }
  function showFieldError(input, el, msg) { input.classList.add('is-invalid'); el.textContent = msg; }
  function showAlert(msg) { loginAlertMsg.textContent = msg; loginAlert.style.display = 'flex'; }
  function hideAlert()    { loginAlert.style.display  = 'none'; }
  function clearErrors()  {
    [emailInput, passwordInput].forEach(i => i.classList.remove('is-invalid'));
    emailError.textContent = passwordError.textContent = '';
    hideAlert();
  }
}

/* Redirect to the correct dashboard based on role.
   Works from the root index.html and from pages/ subdirectory. */
function redirectByRole(role) {
  const inSubdir = window.location.pathname.includes('/pages/');
  const prefix   = inSubdir ? '../' : '';
  const map      = { student: 'pages/student.html', teacher: 'pages/teacher.html', admin: 'pages/admin.html' };
  window.location.href = prefix + (map[role] || 'index.html');
}

/* =============================================
   SECTION 3: Shared navbar / session helpers
   ============================================= */
function initNavbar() {
  if (document.getElementById('loginForm')) return; // login page has no navbar

  const currentUser = getSessionUser();

  // Guard: redirect to login if no session
  if (!currentUser) { window.location.href = getLoginPath(); return; }

  const nameEl   = document.getElementById('navUserName');
  const avatarEl = document.getElementById('navUserAvatar');
  const logoutBtn= document.getElementById('logoutBtn');

  if (nameEl)   nameEl.textContent   = currentUser.name  || currentUser.email;
  if (avatarEl) avatarEl.textContent = getInitials(currentUser.name || currentUser.email);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('att_session');
      window.location.href = getLoginPath();
    });
  }
}

function getSessionUser() {
  try { return JSON.parse(localStorage.getItem('att_session')); }
  catch { return null; }
}

function getInitials(name) {
  return String(name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function getLoginPath() {
  return window.location.pathname.includes('/pages/') ? '../index.html' : 'index.html';
}

/* =============================================
   SECTION 4: Tab switcher (admin page)
   ============================================= */
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

/* =============================================
   SECTION 5: Entry point
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  initLoginPage();
  initNavbar();
  initTabs();
  initAdminPage();
  initTeacherPage();
  initStudentPage();
});

/* =============================================
   SECTION 6: Admin page — state
   ============================================= */
let adminStudents = [];
let adminTeachers = [];
let adminCourses  = [];
let pendingDelete = { type: null, id: null };
let pendingEdit   = { type: null, id: null };
let adminEnrollmentCounts    = {};
let adminEnrollmentTotal     = 0;
let pendingEnrollmentCourseId = null;

/* =============================================
   SECTION 7: Admin page initialisation
   ============================================= */
async function initAdminPage() {
  if (!document.getElementById('studentsBody')) return;

  // Show loading skeletons while data loads
  setTableLoading('studentsBody', 5);
  setTableLoading('teachersBody', 6);
  setTableLoading('coursesBody',  6);

  try {
    await loadAdminData();
  } catch (err) {
    showToast('Failed to load data: ' + err.message, 'error');
  }

  // Add-form panel toggles
  wireAddPanel('toggleAddStudent', 'addStudentPanel', 'closeAddStudent', 'cancelAddStudent', 'Student');
  wireAddPanel('toggleAddTeacher', 'addTeacherPanel', 'closeAddTeacher', 'cancelAddTeacher', 'Teacher');
  wireAddPanel('toggleAddCourse',  'addCoursePanel',  'closeAddCourse',  'cancelAddCourse',  'Course');

  document.getElementById('addStudentForm').addEventListener('submit', handleAddStudent);
  document.getElementById('addTeacherForm').addEventListener('submit', handleAddTeacher);
  document.getElementById('addCourseForm') .addEventListener('submit', handleAddCourse);

  // Live search
  document.getElementById('searchStudents').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    renderStudentsTable(
      adminStudents.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        (s.roll_number || '').toLowerCase().includes(q)
      ), q !== ''
    );
  });

  document.getElementById('searchTeachers').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    renderTeachersTable(
      adminTeachers.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        (t.employee_id || '').toLowerCase().includes(q) ||
        (t.subject || '').toLowerCase().includes(q)
      ), q !== ''
    );
  });

  document.getElementById('searchCourses').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    renderCoursesTable(
      adminCourses.filter(c =>
        c.course_code.toLowerCase().includes(q) ||
        c.course_name.toLowerCase().includes(q) ||
        (c.teacher_name || '').toLowerCase().includes(q)
      ), q !== ''
    );
  });

  // Delete modal wiring
  document.getElementById('closeDeleteModal') .addEventListener('click', closeDeleteModal);
  document.getElementById('cancelDeleteModal').addEventListener('click', closeDeleteModal);
  document.getElementById('confirmDeleteBtn') .addEventListener('click', handleConfirmDelete);
  document.getElementById('deleteModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeDeleteModal(); });

  // Enrollment modal wiring
  document.getElementById('closeEnrollmentModal') .addEventListener('click', closeEnrollmentModal);
  document.getElementById('cancelEnrollmentModal').addEventListener('click', closeEnrollmentModal);
  document.getElementById('saveEnrollmentBtn')    .addEventListener('click', handleSaveEnrollments);
  document.getElementById('enrollmentModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeEnrollmentModal(); });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeEditModal(); closeDeleteModal(); closeEnrollmentModal(); } });
}

/* Fetch all datasets and re-render */
async function loadAdminData() {
  const [students, teachers, courses, enrollResult] = await Promise.all([
    apiFetch('students.php'),
    apiFetch('teachers.php'),
    apiFetch('courses.php'),
    apiFetch('enrollments.php?counts=1').catch(() => ({ counts: {}, total: 0 })),
  ]);
  adminStudents = students;
  adminTeachers = teachers;
  adminCourses  = courses;
  adminEnrollmentCounts = enrollResult.counts || {};
  adminEnrollmentTotal  = enrollResult.total  || 0;

  renderStudentsTable(adminStudents);
  renderTeachersTable(adminTeachers);
  renderCoursesTable(adminCourses);
  populateTeacherSelect();
  updateAdminStats();
}

/* Skeleton rows while data is loading */
function setTableLoading(tbodyId, cols) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = [1, 2, 3].map(() =>
    `<tr>${Array(cols).fill('<td><div class="skeleton-line" style="height:14px;border-radius:4px;background:var(--border);"></div></td>').join('')}</tr>`
  ).join('');
}

/* ---- Stats ---- */
function updateAdminStats() {
  document.getElementById('statStudents').textContent    = adminStudents.length;
  document.getElementById('statTeachers').textContent    = adminTeachers.length;
  document.getElementById('statCourses').textContent     = adminCourses.length;
  document.getElementById('statEnrollments').textContent = adminEnrollmentTotal;
}

/* ---- Table renderers ---- */
function renderStudentsTable(data, isFiltered = false) {
  const tbody = document.getElementById('studentsBody');
  const count = document.getElementById('studentCount');

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <i class="fa-solid fa-users-slash"></i>
      <p>${isFiltered ? 'No students match your search.' : 'No students added yet.'}</p>
    </div></td></tr>`;
    count.textContent = '0 students';
    return;
  }

  tbody.innerHTML = data.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escHtml(s.name)}</strong></td>
      <td style="color:var(--text-secondary);">${escHtml(s.email)}</td>
      <td><span class="badge badge-info">${escHtml(s.roll_number)}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-danger btn-sm" onclick="openDeleteModal('student',${s.student_id},'${escJs(s.name)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');

  count.textContent = isFiltered
    ? `${data.length} of ${adminStudents.length} students`
    : `${adminStudents.length} student${adminStudents.length !== 1 ? 's' : ''}`;
}

function renderTeachersTable(data, isFiltered = false) {
  const tbody = document.getElementById('teachersBody');
  const count = document.getElementById('teacherCount');

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <i class="fa-solid fa-chalkboard-user"></i>
      <p>${isFiltered ? 'No teachers match your search.' : 'No teachers added yet.'}</p>
    </div></td></tr>`;
    count.textContent = '0 teachers';
    return;
  }

  tbody.innerHTML = data.map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escHtml(t.name)}</strong></td>
      <td style="color:var(--text-secondary);">${escHtml(t.email)}</td>
      <td><span class="badge badge-warning">${escHtml(t.employee_id)}</span></td>
      <td>${escHtml(t.subject || '—')}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-danger btn-sm" onclick="openDeleteModal('teacher',${t.teacher_id},'${escJs(t.name)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');

  count.textContent = isFiltered
    ? `${data.length} of ${adminTeachers.length} teachers`
    : `${adminTeachers.length} teacher${adminTeachers.length !== 1 ? 's' : ''}`;
}

function renderCoursesTable(data, isFiltered = false) {
  const tbody = document.getElementById('coursesBody');
  const count = document.getElementById('courseCount');

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
      <i class="fa-solid fa-book-open"></i>
      <p>${isFiltered ? 'No courses match your search.' : 'No courses added yet.'}</p>
    </div></td></tr>`;
    count.textContent = '0 courses';
    return;
  }

  tbody.innerHTML = data.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="badge badge-info">${escHtml(c.course_code)}</span></td>
      <td><strong>${escHtml(c.course_name)}</strong></td>
      <td>${escHtml(c.teacher_name || 'Unassigned')}</td>
      <td><span class="badge badge-info">${adminEnrollmentCounts[String(c.course_id)] || 0} students</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-success btn-sm" onclick="openEnrollmentModal(${c.course_id})">
            <i class="fa-solid fa-users"></i> Students
          </button>
          <button class="btn btn-danger btn-sm" onclick="openDeleteModal('course',${c.course_id},'${escJs(c.course_name)}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');

  count.textContent = isFiltered
    ? `${data.length} of ${adminCourses.length} courses`
    : `${adminCourses.length} course${adminCourses.length !== 1 ? 's' : ''}`;
}

/* ---- Teacher <select> for add-course form ---- */
function populateTeacherSelect() {
  const sel = document.getElementById('cTeacher');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select a teacher —</option>';
  adminTeachers.forEach(t => {
    const opt = document.createElement('option');
    opt.value       = t.teacher_id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

/* ---- Add-panel toggle wiring ---- */
function wireAddPanel(toggleId, panelId, closeId, cancelId, label) {
  const toggleBtn = document.getElementById(toggleId);
  const panel     = document.getElementById(panelId);
  const closeBtn  = document.getElementById(closeId);
  const cancelBtn = document.getElementById(cancelId);
  if (!toggleBtn || !panel) return;

  const open  = () => { panel.style.display = 'block'; toggleBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Cancel'; };
  const close = () => { panel.style.display = 'none';  toggleBtn.innerHTML = `<i class="fa-solid fa-plus"></i> Add ${label}`; };

  toggleBtn.addEventListener('click', () => panel.style.display === 'none' ? open() : close());
  if (closeBtn)  closeBtn.addEventListener('click',  close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);
}

/* ---- Add form handlers ---- */
async function handleAddStudent(e) {
  e.preventDefault();
  const name     = document.getElementById('sName').value.trim();
  const email    = document.getElementById('sEmail').value.trim();
  const roll     = document.getElementById('sRoll').value.trim();
  const password = document.getElementById('sPassword').value;

  if (!name || !email || !roll || !password) { showToast('Please fill in all required fields.', 'error'); return; }

  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await apiFetch('students.php', {
      method: 'POST',
      body:   JSON.stringify({ name, email, roll_number: roll, password }),
    });
    e.target.reset();
    document.getElementById('cancelAddStudent').click();
    await loadAdminData();
    showToast(`Student "${name}" added successfully.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleAddTeacher(e) {
  e.preventDefault();
  const name        = document.getElementById('tName').value.trim();
  const email       = document.getElementById('tEmail').value.trim();
  const employee_id = document.getElementById('tEmployeeId').value.trim();
  const subject     = document.getElementById('tSubject').value.trim();
  const password    = document.getElementById('tPassword').value;

  if (!name || !email || !employee_id || !password) { showToast('Please fill in all required fields.', 'error'); return; }

  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await apiFetch('teachers.php', {
      method: 'POST',
      body:   JSON.stringify({ name, email, employee_id, subject, password }),
    });
    e.target.reset();
    document.getElementById('cancelAddTeacher').click();
    await loadAdminData();
    showToast(`Teacher "${name}" added successfully.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleAddCourse(e) {
  e.preventDefault();
  const course_code = document.getElementById('cCode').value.trim();
  const course_name = document.getElementById('cName').value.trim();
  const teacher_id  = parseInt(document.getElementById('cTeacher').value, 10);

  if (!course_code || !course_name || !teacher_id) { showToast('Please fill in all required fields.', 'error'); return; }

  const btn = e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await apiFetch('courses.php', {
      method: 'POST',
      body:   JSON.stringify({ course_code, course_name, teacher_id }),
    });
    e.target.reset();
    document.getElementById('cancelAddCourse').click();
    await loadAdminData();
    showToast(`Course "${course_name}" added successfully.`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---- Delete modal ---- */
function openDeleteModal(type, id, name) {
  pendingDelete = { type, id };
  document.getElementById('deleteModalMsg').textContent =
    `Are you sure you want to delete "${name}"? This action cannot be undone.`;
  document.getElementById('deleteModal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  pendingDelete = { type: null, id: null };
}

async function handleConfirmDelete() {
  const { type, id } = pendingDelete;
  if (!type || !id) return;

  const endpoints = { student: 'students.php', teacher: 'teachers.php', course: 'courses.php' };
  const bodyKeys  = { student: 'student_id',   teacher: 'teacher_id',   course: 'course_id'   };

  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true;
  try {
    await apiFetch(endpoints[type], {
      method: 'DELETE',
      body:   JSON.stringify({ [bodyKeys[type]]: id }),
    });
    closeDeleteModal();
    await loadAdminData();
    showToast('Record deleted successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* =============================================
   SECTION 8: Enrollment modal
   ============================================= */

function openEnrollmentModal(courseId) {
  pendingEnrollmentCourseId = courseId;
  const course   = adminCourses.find(c => c.course_id == courseId);
  const overlay  = document.getElementById('enrollmentModal');
  const titleEl  = document.getElementById('enrollmentModalTitle');
  const subEl    = document.getElementById('enrollmentModalSubtitle');
  const body     = document.getElementById('enrollmentModalBody');

  if (course) {
    titleEl.textContent = 'Manage Students';
    subEl.textContent   = `${course.course_code}: ${course.course_name}`;
  }

  body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin fa-lg"></i><p style="margin-top:12px;">Loading students…</p></div>';
  updateEnrollmentCount();
  overlay.classList.add('open');

  apiFetch(`enrollments.php?course_id=${courseId}`)
    .then(students => renderEnrollmentList(students))
    .catch(err    => {
      body.innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);">${escHtml(err.message)}</div>`;
    });
}

function renderEnrollmentList(students) {
  const body = document.getElementById('enrollmentModalBody');

  if (!students.length) {
    body.innerHTML = `<div class="empty-state" style="padding:40px;">
      <i class="fa-solid fa-users-slash"></i>
      <p>No students in the system yet. Add students first.</p>
    </div>`;
    updateEnrollmentCount();
    return;
  }

  body.innerHTML = `
    <div class="enrollment-search-bar">
      <div class="table-search-wrap" style="max-width:100%;flex:1;">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="text" class="table-search-input" id="enrollmentSearch"
               placeholder="Search by name or roll number…"
               oninput="filterEnrollmentList()" />
      </div>
    </div>
    <div class="enrollment-bulk-btns">
      <button type="button" class="btn btn-secondary btn-sm" onclick="setAllEnrollments(true)">
        <i class="fa-solid fa-check-double"></i> Select All
      </button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="setAllEnrollments(false)">
        <i class="fa-solid fa-xmark"></i> Clear All
      </button>
    </div>
    <div class="enrollment-list" id="enrollmentList">
      ${students.map(s => `
        <label class="enrollment-item">
          <input type="checkbox" class="enrollment-checkbox"
                 value="${s.student_id}" ${s.enrolled ? 'checked' : ''}
                 onchange="updateEnrollmentCount()" />
          <div class="student-avatar">${escHtml(getInitials(s.name))}</div>
          <div class="enrollment-item-info">
            <div class="enrollment-item-name">${escHtml(s.name)}</div>
            <div class="enrollment-item-roll">${escHtml(s.roll_number)}</div>
          </div>
        </label>`).join('')}
    </div>`;

  updateEnrollmentCount();
}

function filterEnrollmentList() {
  const q = (document.getElementById('enrollmentSearch')?.value || '').trim().toLowerCase();
  document.querySelectorAll('.enrollment-item').forEach(item => {
    const name = item.querySelector('.enrollment-item-name')?.textContent.toLowerCase() || '';
    const roll = item.querySelector('.enrollment-item-roll')?.textContent.toLowerCase() || '';
    item.style.display = (!q || name.includes(q) || roll.includes(q)) ? '' : 'none';
  });
}

function setAllEnrollments(checked) {
  document.querySelectorAll('.enrollment-item').forEach(item => {
    if (item.style.display !== 'none') {
      const cb = item.querySelector('.enrollment-checkbox');
      if (cb) cb.checked = checked;
    }
  });
  updateEnrollmentCount();
}

function updateEnrollmentCount() {
  const total   = document.querySelectorAll('.enrollment-checkbox').length;
  const checked = document.querySelectorAll('.enrollment-checkbox:checked').length;
  const el = document.getElementById('enrollmentSelectedCount');
  if (el) el.textContent = total > 0 ? `${checked} of ${total} students selected` : '';
}

function closeEnrollmentModal() {
  document.getElementById('enrollmentModal').classList.remove('open');
  pendingEnrollmentCourseId = null;
}

async function handleSaveEnrollments() {
  if (!pendingEnrollmentCourseId) return;

  const checkboxes  = document.querySelectorAll('.enrollment-checkbox');
  const student_ids = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => parseInt(cb.value, 10));

  const saveBtn = document.getElementById('saveEnrollmentBtn');
  saveBtn.disabled = true;

  try {
    await apiFetch('enrollments.php', {
      method: 'POST',
      body:   JSON.stringify({ course_id: pendingEnrollmentCourseId, student_ids }),
    });

    // Update local cache so the Enrolled column and stat card refresh instantly
    adminEnrollmentCounts[String(pendingEnrollmentCourseId)] = student_ids.length;
    adminEnrollmentTotal = Object.values(adminEnrollmentCounts).reduce((a, b) => a + b, 0);

    closeEnrollmentModal();
    renderCoursesTable(adminCourses);
    updateAdminStats();
    showToast('Enrollments saved successfully.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/* =============================================
   SECTION 9: Toast notification system
   ============================================= */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const iconMap = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fa-solid ${iconMap[type] || iconMap.info}"></i><span>${escHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 3500);
}

/* =============================================
   SECTION 10: Utility helpers
   ============================================= */
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escJs(str) {
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

/* =============================================
   SECTION 11: Student page initialisation
   ============================================= */
async function initStudentPage() {
  if (!document.getElementById('qr-container')) return;

  const session = getSessionUser();
  if (!session) return; // initNavbar already redirected

  // Show loading state in course grid
  const grid = document.getElementById('courseAttendanceGrid');
  if (grid) grid.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Loading your courses…</div>';

  try {
    // Match the logged-in user to their students record via email
    const allStudents = await apiFetch('students.php');
    const me = allStudents.find(s => s.email === session.email);

    if (!me) {
      showToast('Student profile not found. Contact your administrator.', 'error');
      if (grid) grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Profile not found.</p></div>';
      return;
    }

    const studentId = parseInt(me.student_id, 10);

    // Update profile header with real data
    const avatarEl = document.getElementById('studentAvatarLg');
    const nameEl   = document.getElementById('studentNameLg');
    const infoEl   = document.getElementById('studentInfoLg');
    if (avatarEl) avatarEl.textContent = getInitials(me.name);
    if (nameEl)   nameEl.textContent   = me.name;
    if (infoEl)   infoEl.innerHTML     = `${escHtml(me.roll_number)} &nbsp;·&nbsp; Student`;

    // Fetch all courses and this student's enrolled course IDs in parallel
    const [allCourses, enrolledCourseIds] = await Promise.all([
      apiFetch('courses.php'),
      apiFetch(`enrollments.php?student_id=${studentId}`),
    ]);

    // Fetch attendance for each course, filter to this student
    const attByCourse = {};
    await Promise.all(allCourses.map(async c => {
      try {
        const recs = await apiFetch(`attendance.php?course_id=${c.course_id}`);
        attByCourse[c.course_id] = recs.filter(r => parseInt(r.student_id) === studentId);
      } catch {
        attByCourse[c.course_id] = [];
      }
    }));

    // Build per-course summaries; include all courses with any data (or all if dataset is small)
    const myCourses = allCourses.map(c => {
      const recs    = attByCourse[c.course_id] || [];
      const present = recs.filter(r => r.status === 'present' || r.status === 'late').length;
      const absent  = recs.filter(r => r.status === 'absent').length;
      return { ...c, present, absent, totalSessions: recs.length };
    }).filter(c => c.totalSessions > 0);

    renderStudentStats(myCourses);
    renderCourseAttendanceCards(myCourses);

    // Build recent attendance history across all courses (latest 10)
    const history = [];
    allCourses.forEach(c => {
      (attByCourse[c.course_id] || []).forEach(r => {
        history.push({
          date:       (r.scanned_at || '').slice(0, 10),
          courseCode: c.course_code,
          courseName: c.course_name,
          status:     r.status,
          time:       (r.scanned_at || '').slice(11, 16) || null,
        });
      });
    });
    history.sort((a, b) => b.date.localeCompare(a.date));
    renderAttendanceHistory(history.slice(0, 10));

    // Populate QR course dropdown with real courses
    const courseSelect = document.getElementById('qrCourseSelect');
    const genBtn       = document.getElementById('btn-gen');
    if (courseSelect) {
      allCourses
        .filter(c => enrolledCourseIds.includes(parseInt(c.course_id, 10)))
        .forEach(c => {
          const opt = document.createElement('option');
          opt.value       = c.course_id;
          opt.textContent = `${c.course_code} — ${c.course_name}`;
          courseSelect.appendChild(opt);
        });
      courseSelect.addEventListener('change', () => {
        if (genBtn) genBtn.disabled = !courseSelect.value;
      });
    }

    // Wire QR generate button with real student_id
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        if (!courseSelect?.value) return;
        document.getElementById('qrIdleState').style.display   = 'none';
        document.getElementById('qrActiveState').style.display = 'flex';
        QRAttendance.initQR({
          studentId:     studentId,
          courseId:      parseInt(courseSelect.value, 10),
          qrContainerId: 'qr-container',
          timerId:       'qr-timer',
          statusId:      'qr-status',
          btnId:         'btn-gen',
        });
        showToast('QR code generated. Valid for 5 seconds.', 'info');
      });
    }

  } catch (err) {
    showToast('Failed to load your data: ' + err.message, 'error');
  }
}

function renderStudentStats(courses) {
  const totalPresent = courses.reduce((s, c) => s + c.present, 0);
  const totalAbsent  = courses.reduce((s, c) => s + c.absent,  0);
  const totalSess    = courses.reduce((s, c) => s + c.totalSessions, 0);
  const rate         = totalSess ? Math.round(totalPresent / totalSess * 100) : 0;

  document.getElementById('sStatCourses').textContent = courses.length;
  document.getElementById('sStatPresent').textContent = totalPresent;
  document.getElementById('sStatAbsent').textContent  = totalAbsent;
  document.getElementById('sStatRate').textContent    = `${rate}%`;

  const atRisk  = courses.filter(c => c.totalSessions > 0 && (c.present / c.totalSessions) < 0.75);
  const alertEl = document.getElementById('attendanceAlert');
  const msgEl   = document.getElementById('attendanceAlertMsg');
  if (atRisk.length && alertEl && msgEl) {
    msgEl.textContent =
      `Your attendance in ${atRisk.map(c => c.course_code).join(', ')} is below the required 75%. ` +
      `Please attend upcoming sessions to avoid academic consequences.`;
    alertEl.style.display = 'flex';
  }
}

function renderCourseAttendanceCards(courses) {
  const grid = document.getElementById('courseAttendanceGrid');
  if (!grid) return;

  if (!courses.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-xmark"></i><p>No attendance records found.</p></div>`;
    return;
  }

  const CIRC = 2 * Math.PI * 18;
  grid.innerHTML = courses.map(c => {
    const pct       = c.totalSessions ? Math.round(c.present / c.totalSessions * 100) : 0;
    const offset    = (CIRC * (1 - pct / 100)).toFixed(1);
    const rateClass = pct >= 75 ? 'rate-good' : pct >= 50 ? 'rate-warn' : 'rate-bad';
    const ringColor = pct >= 75 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    const badgeCls  = pct >= 75 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger';
    return `
      <div class="course-att-card">
        <div class="att-ring-wrap">
          <svg class="att-ring" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" stroke-width="4"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="${ringColor}" stroke-width="4"
              stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${offset}"
              stroke-linecap="round" transform="rotate(-90 22 22)"/>
          </svg>
          <div class="att-ring-pct ${rateClass}">${pct}%</div>
        </div>
        <div class="att-course-info">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge badge-info">${escHtml(c.course_code)}</span>
            <span class="badge ${badgeCls}">${pct >= 75 ? 'On Track' : pct >= 50 ? 'At Risk' : 'Critical'}</span>
          </div>
          <h4 class="att-course-name">${escHtml(c.course_name)}</h4>
          <p class="att-teacher"><i class="fa-solid fa-chalkboard-user"></i> ${escHtml(c.teacher_name || 'Unassigned')}</p>
          <div class="att-counts">
            <span class="att-count-item present"><i class="fa-solid fa-check"></i> ${c.present} present</span>
            <span class="att-count-item absent"><i class="fa-solid fa-xmark"></i> ${c.absent} absent</span>
            <span class="att-count-item total"><i class="fa-solid fa-layer-group"></i> ${c.totalSessions} sessions</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function renderAttendanceHistory(history) {
  const tbody = document.getElementById('historyBody');
  if (!tbody) return;

  if (!history.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state">
      <i class="fa-solid fa-calendar-xmark"></i><p>No attendance history yet.</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = history.map(h => {
    const isPresent = h.status === 'present' || h.status === 'late';
    return `
      <tr>
        <td style="color:var(--text-secondary);white-space:nowrap;">${escHtml(h.date)}</td>
        <td>
          <span class="badge badge-info">${escHtml(h.courseCode)}</span>
          <span style="margin-left:6px;font-size:.83rem;color:var(--text-secondary);">${escHtml(h.courseName)}</span>
        </td>
        <td>
          <span class="badge ${isPresent ? 'badge-success' : 'badge-danger'}">
            <i class="fa-solid ${isPresent ? 'fa-check' : 'fa-xmark'}"></i>
            ${h.status.charAt(0).toUpperCase() + h.status.slice(1)}
          </span>
        </td>
        <td>
          ${isPresent && h.time
            ? `<span class="checkin-time"><i class="fa-solid fa-clock"></i> ${escHtml(h.time)}</span>`
            : `<span style="color:var(--text-muted);">—</span>`}
        </td>
      </tr>`;
  }).join('');
}

/* =============================================
   SECTION 12: Teacher page initialisation
   ============================================= */
let selectedCourseId       = null;
let teacherCourses         = [];
let teacherAllStudents     = [];
let teacherAttendanceCache = {}; // course_id → { student_id: { status, time } }

async function initTeacherPage() {
  if (!document.getElementById('courseList')) return;

  const session = getSessionUser();
  if (!session) return;

  document.getElementById('attendanceDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('courseList').innerHTML  =
    '<div style="padding:24px;text-align:center;color:var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div>';

  try {
    // Resolve this teacher's teacher_id by matching their login email
    const allTeachers = await apiFetch('teachers.php');
    const me = allTeachers.find(t => t.email === session.email);

    if (!me) {
      showToast('Teacher profile not found. Contact your administrator.', 'error');
      document.getElementById('courseList').innerHTML =
        '<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Profile not found.</p></div>';
      return;
    }

    const teacherId    = parseInt(me.teacher_id, 10);
    const allCourses   = await apiFetch('courses.php');
    teacherCourses     = allCourses.filter(c => parseInt(c.teacher_id) === teacherId);
    teacherAllStudents = await apiFetch('students.php');

    renderTeacherCourseCards();
    updateTeacherStats();

    if (teacherCourses.length) {
      await selectTeacherCourse(teacherCourses[0].course_id);
    } else {
      document.getElementById('attendanceCourseTitle').textContent = 'No courses assigned';
      document.getElementById('courseList').innerHTML =
        '<div class="empty-state"><p>No courses assigned to you.</p></div>';
    }

  } catch (err) {
    showToast('Failed to load teacher data: ' + err.message, 'error');
  }

  // Live search in the attendance table
  document.getElementById('searchAttendance').addEventListener('input', e => {
    renderTeacherAttendanceTable(selectedCourseId, e.target.value.trim().toLowerCase());
  });

  // Date change — reload attendance from API for the new date
  document.getElementById('attendanceDate').addEventListener('change', async () => {
    document.getElementById('searchAttendance').value = '';
    if (selectedCourseId) await loadAndRenderAttendance(selectedCourseId);
  });

  document.getElementById('markAllPresent').addEventListener('click', () => markAllTeacher('present'));
  document.getElementById('markAllAbsent') .addEventListener('click', () => markAllTeacher('absent'));
  document.getElementById('saveAttendanceBtn').addEventListener('click', () => showToast('Attendance saved.', 'success'));
}

/* Fetch attendance for a course+date and store in cache */
async function loadAndRenderAttendance(courseId) {
  const date = document.getElementById('attendanceDate').value;
  try {
    const records = await apiFetch(`attendance.php?course_id=${courseId}&date=${date}`);
    const map = {};
    records.forEach(r => {
      map[r.student_id] = {
        status: r.status,
        time:   (r.scanned_at || '').slice(11, 16) || null,
      };
    });
    teacherAttendanceCache[courseId] = map;
  } catch {
    teacherAttendanceCache[courseId] = {};
  }
  renderTeacherAttendanceTable(courseId);
  renderTeacherCourseCards();
  updateTeacherStats();
}

function renderTeacherCourseCards() {
  const list = document.getElementById('courseList');
  if (!list) return;

  if (!teacherCourses.length) return;

  list.innerHTML = teacherCourses.map(c => {
    const att      = teacherAttendanceCache[c.course_id] || {};
    const present  = Object.values(att).filter(r => r.status === 'present').length;
    const total    = teacherAllStudents.length;
    const pct      = total ? Math.round(present / total * 100) : 0;

    return `
      <div class="course-card${selectedCourseId === c.course_id ? ' active' : ''}" data-course-id="${c.course_id}" onclick="selectTeacherCourse(${c.course_id})">
        <div class="course-card-header">
          <span class="badge badge-info">${escHtml(c.course_code)}</span>
          <span class="course-enrolled"><i class="fa-solid fa-users"></i> ${total}</span>
        </div>
        <h4 class="course-card-name">${escHtml(c.course_name)}</h4>
        <p class="course-schedule"><i class="fa-solid fa-calendar"></i> ${escHtml(c.semester || '—')}</p>
        <div class="course-card-footer">
          <div class="course-mini-progress"><div class="mini-bar" style="width:${pct}%"></div></div>
          <span class="course-mini-stat">${present}/${total} present</span>
        </div>
      </div>`;
  }).join('');
}

async function selectTeacherCourse(courseId) {
  selectedCourseId = courseId;
  document.querySelectorAll('.course-card').forEach(card => {
    card.classList.toggle('active', parseInt(card.dataset.courseId) === courseId);
  });

  const course = teacherCourses.find(c => c.course_id == courseId);
  if (!course) return;

  document.getElementById('attendanceCourseTitle').textContent = `${course.course_code}: ${course.course_name}`;
  document.getElementById('attendanceCourseDesc') .textContent = `Semester: ${course.semester || '—'}  ·  ${teacherAllStudents.length} students`;
  document.getElementById('searchAttendance').value = '';

  await loadAndRenderAttendance(courseId);
}

function renderTeacherAttendanceTable(courseId, query = '') {
  const tbody = document.getElementById('attendanceBody');
  if (!tbody) return;

  let students = [...teacherAllStudents];
  const att    = teacherAttendanceCache[courseId] || {};

  if (query) {
    students = students.filter(s =>
      s.name.toLowerCase().includes(query) ||
      (s.roll_number || '').toLowerCase().includes(query)
    );
  }

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state">
      <i class="fa-solid fa-users-slash"></i>
      <p>${query ? 'No students match your search.' : 'No students found.'}</p>
    </div></td></tr>`;
    updateAttendanceSummary(0, 0);
    return;
  }

  tbody.innerHTML = students.map((s, i) => {
    const rec       = att[s.student_id] || { status: 'absent', time: null };
    const isPresent = rec.status === 'present';
    return `
      <tr>
        <td>${i + 1}</td>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="student-avatar">${getInitials(s.name)}</div>
            <strong>${escHtml(s.name)}</strong>
          </div>
        </td>
        <td><span class="badge badge-info">${escHtml(s.roll_number)}</span></td>
        <td>
          ${isPresent && rec.time
            ? `<span class="checkin-time"><i class="fa-solid fa-clock"></i> ${escHtml(rec.time)}</span>`
            : `<span style="color:var(--text-muted);font-size:.83rem;">—</span>`}
        </td>
        <td>
          <div class="status-btn-group">
            <button class="status-btn present ${isPresent ? 'active' : ''}"
              onclick="teacherMarkAttendance(${courseId},${s.student_id},'present')">
              <i class="fa-solid fa-check"></i> Present
            </button>
            <button class="status-btn absent ${!isPresent ? 'active' : ''}"
              onclick="teacherMarkAttendance(${courseId},${s.student_id},'absent')">
              <i class="fa-solid fa-xmark"></i> Absent
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');

  const all          = teacherAllStudents;
  const presentCount = all.filter(s => att[s.student_id]?.status === 'present').length;
  updateAttendanceSummary(presentCount, all.length - presentCount);
}

/* Mark a single student — POST to API only when marking present (absent = no record) */
async function teacherMarkAttendance(courseId, studentId, status) {
  if (!teacherAttendanceCache[courseId]) teacherAttendanceCache[courseId] = {};

  if (status === 'present') {
    try {
      await apiFetch('attendance.php', {
        method: 'POST',
        body:   JSON.stringify({ student_id: studentId, course_id: courseId, status: 'present' }),
      });
    } catch (err) {
      // 409 = already recorded today — that's acceptable, update cache anyway
      if (!err.message.toLowerCase().includes('already')) {
        showToast(err.message, 'error');
        return;
      }
    }
  }

  const now  = new Date();
  const time = status === 'present'
    ? `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    : null;
  teacherAttendanceCache[courseId][studentId] = { status, time };

  const q = document.getElementById('searchAttendance').value.trim().toLowerCase();
  renderTeacherAttendanceTable(courseId, q);
  renderTeacherCourseCards();
  updateTeacherStats();
}

/* Mark every student in the current course */
async function markAllTeacher(status) {
  if (!selectedCourseId) return;
  if (!teacherAttendanceCache[selectedCourseId]) teacherAttendanceCache[selectedCourseId] = {};

  const now  = new Date();
  const time = status === 'present'
    ? `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
    : null;

  for (const s of teacherAllStudents) {
    if (status === 'present') {
      try {
        await apiFetch('attendance.php', {
          method: 'POST',
          body:   JSON.stringify({ student_id: s.student_id, course_id: selectedCourseId, status }),
        });
      } catch { /* ignore duplicate errors */ }
    }
    teacherAttendanceCache[selectedCourseId][s.student_id] = { status, time };
  }

  renderTeacherAttendanceTable(selectedCourseId);
  renderTeacherCourseCards();
  updateTeacherStats();
  showToast(`All students marked as ${status}.`, status === 'present' ? 'success' : 'warning');
}

function updateAttendanceSummary(present, absent) {
  const total = present + absent;
  document.getElementById('presentCount') .textContent = present;
  document.getElementById('absentCount')  .textContent = absent;
  document.getElementById('attendanceRate').textContent = total > 0 ? Math.round(present / total * 100) + '%' : '0%';
}

function updateTeacherStats() {
  let totalPresent = 0, totalAbsent = 0;
  teacherCourses.forEach(c => {
    const att = teacherAttendanceCache[c.course_id] || {};
    Object.values(att).forEach(r => r.status === 'present' ? totalPresent++ : totalAbsent++);
  });
  const el = id => document.getElementById(id);
  if (el('tStatCourses'))  el('tStatCourses') .textContent = teacherCourses.length;
  if (el('tStatStudents')) el('tStatStudents').textContent = teacherAllStudents.length;
  if (el('tStatPresent'))  el('tStatPresent') .textContent = totalPresent;
  if (el('tStatAbsent'))   el('tStatAbsent')  .textContent = totalAbsent;
}
