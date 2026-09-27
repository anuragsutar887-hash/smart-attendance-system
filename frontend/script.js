// ============================================================
//  script.js — Student Management & General UI Logic
//  Smart Attendance Management System v2 (Firebase + Supabase)
// ============================================================

// Teacher role guard
if (typeof Auth !== 'undefined') {
    Auth.requireRole('teacher');

    const profile = Auth.getProfile();
    if (profile) {
        const avatarEl = document.getElementById('header-avatar');
        const nameEl = document.getElementById('header-user-name');
        const deptEl = document.getElementById('header-dept');
        if (avatarEl) avatarEl.textContent = profile.name ? profile.name.charAt(0).toUpperCase() : 'T';
        if (nameEl) nameEl.textContent = profile.name || 'Teacher';
        if (deptEl) deptEl.textContent = profile.department ? profile.department + ' Dept' : 'Faculty';
    }
}

// ----------------------------------------------------------------------------
// Student Management (students.html)
// ----------------------------------------------------------------------------
const studentForm = document.getElementById("student-form");
if (studentForm) {
    let students = [];
    let editingStudentId = null;
    const studentTableBody = document.getElementById("student-table-body");
    const searchInput = document.getElementById("student-search");
    const formMessage = document.getElementById("form-message");
    const submitButton = document.getElementById("student-submit");
    const cancelButton = document.getElementById("cancel-edit");

    const API_URL = (typeof API_BASE !== 'undefined' ? API_BASE : 'http://localhost:8080') + "/api/students";

    function showMessage(msg, isError = false) {
        if (!formMessage) return;
        formMessage.textContent = msg;
        formMessage.style.color = isError ? "#b91c1c" : "#15803d";
    }

    async function fetchStudents() {
        try {
            const headers = typeof Auth !== 'undefined' ? await Auth.apiHeaders() : { 'Content-Type': 'application/json' };
            const response = await fetch(API_URL, { headers });
            if (response.status === 401 && typeof Auth !== 'undefined') {
                Auth.clearLocal();
                window.location.href = 'index.html';
                return;
            }
            if (!response.ok) throw new Error("Failed to fetch students");
            const data = await response.json();
            students = data || [];
            renderStudents();
        } catch (err) {
            console.error(err);
            if (studentTableBody) {
                studentTableBody.innerHTML = `<tr><td class="empty-row" colspan="6"><div class="empty-state-content"><span class="empty-icon">⚠️</span><p style="color:#b91c1c;">${err.message || 'Failed to load students.'}</p></div></td></tr>`;
            }
            showMessage(err.message || 'Failed to load students.', true);
        }
    }

    function getFormStudent() {
        return {
            roll_no: document.getElementById("roll-number").value.trim(),
            name: document.getElementById("student-name").value.trim(),
            branch: document.getElementById("student-branch").value.trim(),
            year: parseInt(document.getElementById("student-year").value.trim(), 10),
            email: document.getElementById("student-email").value.trim()
        };
    }

    function renderStudents() {
        if (!studentTableBody) return;
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
        const visible = students.filter(s =>
            [(s.roll_no || ''), (s.name || ''), (s.branch || '')].some(v => v.toLowerCase().includes(searchTerm))
        );
        studentTableBody.innerHTML = "";
        if (visible.length === 0) {
            studentTableBody.innerHTML = '<tr><td class="empty-row" colspan="6"><div class="empty-state-content"><span class="empty-icon">📋</span><p>No students found.</p></div></td></tr>';
            return;
        }
        visible.forEach(student => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong style="font-family:monospace;color:var(--text-main);">${escapeHtml(student.roll_no)}</strong></td>
                <td><strong>${escapeHtml(student.name)}</strong></td>
                <td>${escapeHtml(student.branch)}</td>
                <td>Year ${student.year}</td>
                <td>${escapeHtml(student.email)}</td>
                <td>
                    <button class="table-action edit-button" data-action="edit" data-id="${student.id}">Edit</button>
                    <button class="table-action delete-button" data-action="delete" data-id="${student.id}">Delete</button>
                </td>
            `;
            studentTableBody.appendChild(row);
        });
    }

    function resetStudentForm(clearMsg = true) {
        studentForm.reset();
        editingStudentId = null;
        if (submitButton) submitButton.textContent = "Add Student";
        if (cancelButton) cancelButton.style.display = "none";
        if (clearMsg) showMessage("");
    }

    function startEditing(id) {
        const student = students.find(s => String(s.id) === String(id));
        if (!student) return;
        document.getElementById("roll-number").value = student.roll_no || '';
        document.getElementById("student-name").value = student.name || '';
        document.getElementById("student-branch").value = student.branch || '';
        document.getElementById("student-year").value = student.year || '';
        document.getElementById("student-email").value = student.email || '';
        editingStudentId = id;
        if (submitButton) submitButton.textContent = "Update Student";
        if (cancelButton) cancelButton.style.display = "inline-block";
        showMessage("");
        document.getElementById("roll-number").focus();
    }

    async function addStudent(data) {
        const headers = typeof Auth !== 'undefined' ? await Auth.apiHeaders() : { 'Content-Type': 'application/json' };
        const response = await fetch(API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify(data)
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(json.error || "Failed to add student.");
        }
        return json.student;
    }

    async function updateStudent(id, data) {
        const headers = typeof Auth !== 'undefined' ? await Auth.apiHeaders() : { 'Content-Type': 'application/json' };
        const response = await fetch(`${API_URL}/${id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify(data)
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(json.error || "Failed to update student.");
        }
        return json.student;
    }

    async function deleteStudent(id) {
        const headers = typeof Auth !== 'undefined' ? await Auth.apiHeaders() : { 'Content-Type': 'application/json' };
        const response = await fetch(`${API_URL}/${id}`, { method: "DELETE", headers });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(json.error || "Failed to delete student.");
        }
        return json;
    }

    studentForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        const formStudent = getFormStudent();

        if (!formStudent.roll_no) {
            showMessage("PRN / Roll number is required.", true);
            return;
        }
        if (!formStudent.name) {
            showMessage("Name is required.", true);
            return;
        }
        if (!formStudent.branch) {
            showMessage("Department is required.", true);
            return;
        }
        if (isNaN(formStudent.year) || formStudent.year < 1 || formStudent.year > 6) {
            showMessage("Academic year must be between 1 and 6.", true);
            return;
        }
        if (!formStudent.email) {
            showMessage("Email is required.", true);
            return;
        }

        try {
            if (editingStudentId === null) {
                const newStudent = await addStudent(formStudent);
                if (newStudent) students.push(newStudent);
                resetStudentForm(false);
                showMessage("✅ Student added successfully.", false);
            } else {
                const updatedStudent = await updateStudent(editingStudentId, formStudent);
                if (updatedStudent) {
                    students = students.map(s => String(s.id) === String(editingStudentId) ? updatedStudent : s);
                }
                resetStudentForm(false);
                showMessage("✅ Student updated successfully.", false);
            }
            await fetchStudents();
        } catch (err) {
            showMessage(err.message || "Failed to save student.", true);
        }
    });

    if (cancelButton) cancelButton.addEventListener("click", () => resetStudentForm(true));
    if (searchInput) searchInput.addEventListener("input", renderStudents);

    if (studentTableBody) {
        studentTableBody.addEventListener("click", async function (event) {
            const btn = event.target.closest("button");
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.dataset.action === "edit") {
                startEditing(id);
            } else if (btn.dataset.action === "delete") {
                if (confirm("Delete this student record? This cannot be undone.")) {
                    try {
                        await deleteStudent(id);
                        students = students.filter(s => String(s.id) !== String(id));
                        renderStudents();
                        showMessage("✅ Student deleted successfully.", false);
                    } catch (err) {
                        alert(err.message || "Failed to delete student.");
                    }
                }
            }
        });
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    fetchStudents();
}
